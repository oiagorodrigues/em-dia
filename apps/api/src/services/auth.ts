import type { PublicUser } from "@emdia/shared";
import { DEFAULT_TIMEZONE, type RegisterInput } from "@emdia/shared";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/crypto.ts";
import { AppError, fieldError, formError } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import {
  toPublicUser,
  type RefreshTokenRecord,
  type TxRepos,
  type UserRecord,
} from "../repos/index.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";
import { linkWorkerByCode, resolveInvite } from "./invites.ts";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const LOCK_THRESHOLD = 5;
const LOCK_MS = 15 * 60 * 1000;

export interface Session {
  accessToken: string;
  /** Raw value for the cookie; only its hash is stored. */
  refreshToken: string;
  user: PublicUser;
}

const invalidCredentials = () => new AppError("UNAUTHENTICATED", "E-mail ou senha incorretos");
const invalidSession = () => new AppError("UNAUTHENTICATED", "Sessão inválida. Entre novamente.");

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed: users\.email/.test(err.message);
}

export function authService(deps: ServiceDeps) {
  const { repos, tokens } = deps;
  const at = (offsetMs: number) => new Date(deps.clock().getTime() + offsetMs).toISOString();
  const userEvent = (r: TxRepos, userId: string, action: string) =>
    audit(deps, { actorId: userId, contractId: null, action, entity: "user", entityId: userId }, r);

  // Verifying against a real hash when the e-mail is unknown keeps response time from revealing which e-mails exist.
  let dummyHash: Promise<string> | undefined;
  const burnPasswordCheck = async (password: string) => {
    dummyHash ??= hashPassword(randomToken());
    await verifyPassword(password, await dummyHash);
  };

  /**
   * A token rotated moments ago is usually a lost response, a reload mid-refresh
   * or two tabs refreshing at once, not theft. Only plain rotations qualify:
   * logout, password changes and earlier reuse detection end the family for good.
   */
  async function isBenignReplay(token: RefreshTokenRecord, now: string): Promise<boolean> {
    if (token.revokedReason !== "rotated" || !token.revokedAt || token.expiresAt <= now)
      return false;
    const age = deps.clock().getTime() - Date.parse(token.revokedAt);
    return (
      age < deps.config.refreshReuseGraceMs &&
      !(await repos.refreshTokens.isFamilyRevoked(token.familyId))
    );
  }

  async function issueSession(user: UserRecord, familyId = newId()): Promise<Session> {
    const refreshToken = randomToken();
    await repos.refreshTokens.insert({
      id: newId(),
      userId: user.id,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt: at(REFRESH_TTL_MS),
      createdAt: nowIso(deps),
    });
    const accessToken = await tokens.sign({ sub: user.id, role: user.role, tv: user.tokenVersion });
    return { accessToken, refreshToken, user: toPublicUser(user) };
  }

  async function loadUser(id: string): Promise<UserRecord> {
    const user = await repos.users.findById(id);
    if (!user) throw invalidSession();
    return user;
  }

  return {
    async register(input: RegisterInput): Promise<Session> {
      if (await repos.users.findByEmail(input.email)) {
        throw new AppError("CONFLICT", "Já existe uma conta com este e-mail");
      }
      const inviteCode = input.role === "worker" ? input.inviteCode : undefined;
      if (inviteCode && !(await resolveInvite(deps, inviteCode))) {
        throw fieldError("inviteCode", "Código de convite inválido ou expirado");
      }

      const passwordHash = await hashPassword(input.password);
      const id = newId();
      const createdAt = nowIso(deps);
      try {
        await repos.tx(async (r) => {
          await r.users.insert({
            id,
            email: input.email,
            name: input.name,
            role: input.role,
            passwordHash,
            createdAt,
          });
          if (input.role === "employer") {
            await r.households.insert({
              id: newId(),
              ownerId: id,
              name: "Minha casa",
              timezone: DEFAULT_TIMEZONE,
              createdAt,
            });
          }
          await userEvent(r, id, "auth.register");
          if (inviteCode) await linkWorkerByCode(deps, r, id, inviteCode);
        });
      } catch (err) {
        if (isUniqueViolation(err))
          throw new AppError("CONFLICT", "Já existe uma conta com este e-mail");
        throw err;
      }
      return issueSession(await loadUser(id));
    },

    async login(email: string, password: string): Promise<Session> {
      const user = await repos.users.findByEmail(email);
      if (!user) {
        await burnPasswordCheck(password);
        throw invalidCredentials();
      }
      const locked = () =>
        new AppError(
          "ACCOUNT_LOCKED",
          "Muitas tentativas sem sucesso. Tente de novo em 15 minutos.",
        );
      if (user.lockedUntil && user.lockedUntil > nowIso(deps)) throw locked();

      if (!(await verifyPassword(password, user.passwordHash))) {
        const lockedUntil = await repos.users.recordLoginFailure(
          user.id,
          LOCK_THRESHOLD,
          at(LOCK_MS),
        );
        if (lockedUntil) {
          await userEvent(repos, user.id, "auth.locked");
          throw locked();
        }
        throw invalidCredentials();
      }

      await repos.users.clearLoginFailures(user.id);
      await userEvent(repos, user.id, "auth.login");
      return issueSession(user);
    },

    async refresh(rawToken: string | undefined): Promise<Session> {
      if (!rawToken) throw invalidSession();
      const tokenHash = sha256(rawToken);
      const record = await repos.refreshTokens.findByHash(tokenHash);
      if (!record) throw invalidSession();

      const now = nowIso(deps);
      if (!record.revokedAt) {
        if (record.expiresAt <= now) throw invalidSession();
        if (await repos.refreshTokens.revoke(record.id, now, "rotated")) {
          return issueSession(await loadUser(record.userId), record.familyId);
        }
      }

      // Re-read: if the revoke above lost a race, the winner's revocation is what matters.
      const revoked = (await repos.refreshTokens.findByHash(tokenHash)) ?? record;
      if (await isBenignReplay(revoked, now)) {
        return issueSession(await loadUser(revoked.userId), revoked.familyId);
      }

      // A rotated token showing up again means it was copied: kill every token descended from the same login.
      await repos.refreshTokens.revokeFamily(record.familyId, now, "reuse");
      await userEvent(repos, record.userId, "auth.refresh_reuse");
      deps.logger.warn("refresh token reuse detected", {
        userId: record.userId,
        familyId: record.familyId,
      });
      throw invalidSession();
    },

    async logout(rawToken: string | undefined): Promise<void> {
      if (!rawToken) return;
      const record = await repos.refreshTokens.findByHash(sha256(rawToken));
      if (record) await repos.refreshTokens.revokeFamily(record.familyId, nowIso(deps), "logout");
    },

    async logoutAll(actor: Actor): Promise<void> {
      await repos.tx(async (r) => {
        await r.refreshTokens.revokeAllForUser(actor.id, nowIso(deps), "logout_all");
        await r.users.bumpTokenVersion(actor.id);
      });
    },

    async forgotPassword(email: string): Promise<void> {
      const user = await repos.users.findByEmail(email);
      if (!user) return;
      const token = randomToken();
      await repos.passwordResets.replace({
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt: at(RESET_TTL_MS),
        createdAt: nowIso(deps),
      });
      const link = `${deps.config.webOrigin}/redefinir-senha?token=${encodeURIComponent(token)}`;
      try {
        await deps.mailer.send({
          to: user.email,
          subject: "em dia · redefinir senha",
          text: `Olá, ${user.name}.\n\nPara criar uma nova senha, abra o link abaixo (vale por 30 minutos):\n${link}\n\nSe não foi você, ignore este e-mail.`,
        });
      } catch (err) {
        deps.logger.error("failed to send reset mail", { err, userId: user.id });
      }
    },

    async resetPassword(token: string, password: string): Promise<void> {
      const tokenHash = sha256(token);
      const expired = () => formError("Link inválido ou expirado. Peça um novo.");
      const userId = await repos.passwordResets.findValidUserId(tokenHash, nowIso(deps));
      if (!userId) throw expired();
      const passwordHash = await hashPassword(password);
      await repos.tx(async (r) => {
        if (!(await r.passwordResets.markUsed(tokenHash, nowIso(deps)))) throw expired();
        await r.users.setPassword(userId, passwordHash);
        await r.refreshTokens.revokeAllForUser(userId, nowIso(deps), "password_reset");
        await userEvent(r, userId, "auth.password_reset");
      });
    },

    /**
     * Anonymises instead of deleting so the other party keeps their records:
     * an employer's contracts are archived, a worker is unlinked from theirs.
     */
    async deleteAccount(actor: Actor, password: string): Promise<void> {
      requirePermission(actor, "account:delete");
      const user = await loadUser(actor.id);
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw fieldError("password", "Senha incorreta");
      }
      const now = nowIso(deps);
      await repos.tx(async (r) => {
        const contractEvent = (contractId: string, action: string) =>
          audit(
            deps,
            { actorId: user.id, contractId, action, entity: "contract", entityId: contractId },
            r,
          );
        if (user.role === "employer") {
          for (const { contract } of await r.contracts.listForEmployer(user.id)) {
            await r.contracts.setArchivedAt(contract.id, now);
            await r.invites.deleteForContract(contract.id);
            await contractEvent(contract.id, "contract.archive");
          }
        } else {
          for (const { contract } of await r.contracts.listForWorker(user.id, true)) {
            await contractEvent(contract.id, "contract.worker_left");
          }
          await r.contracts.unlinkWorker(user.id);
        }
        await r.refreshTokens.revokeAllForUser(user.id, now, "account_deleted");
        await r.passwordResets.deleteForUser(user.id);
        await r.users.anonymize(user.id, `excluida-${user.id}@conta-excluida.invalid`);
        await userEvent(r, user.id, "auth.delete_account");
      });
    },

    async changePassword(
      actor: Actor,
      currentPassword: string,
      newPassword: string,
    ): Promise<Session> {
      const user = await loadUser(actor.id);
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw fieldError("currentPassword", "Senha atual incorreta");
      }
      const passwordHash = await hashPassword(newPassword);
      await repos.tx(async (r) => {
        await r.users.setPassword(user.id, passwordHash);
        await r.refreshTokens.revokeAllForUser(user.id, nowIso(deps), "password_change");
        await userEvent(r, user.id, "auth.password_change");
      });
      return issueSession(await loadUser(user.id));
    },

    /** Validates an access token and checks it was not invalidated by a token-version bump. */
    async authenticate(accessToken: string): Promise<Actor> {
      const claims = await tokens.verify(accessToken);
      const user = await repos.users.findById(claims.sub);
      if (!user || user.tokenVersion !== claims.tv || user.role !== claims.role)
        throw invalidSession();
      return toPublicUser(user);
    },
  };
}
