import type { PublicUser } from "@emdia/shared";
import { DEFAULT_TIMEZONE, type RegisterInput } from "@emdia/shared";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/crypto.ts";
import { AppError, fieldError, formError } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import { toPublicUser, type RefreshTokenRecord, type UserRecord } from "../repos/index.ts";
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
  function isBenignReplay(token: RefreshTokenRecord, now: string): boolean {
    if (token.revokedReason !== "rotated" || !token.revokedAt || token.expiresAt <= now)
      return false;
    const age = deps.clock().getTime() - Date.parse(token.revokedAt);
    return (
      age < deps.config.refreshReuseGraceMs && !repos.refreshTokens.isFamilyRevoked(token.familyId)
    );
  }

  async function issueSession(user: UserRecord, familyId = newId()): Promise<Session> {
    const refreshToken = randomToken();
    repos.refreshTokens.insert({
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

  function loadUser(id: string): UserRecord {
    const user = repos.users.findById(id);
    if (!user) throw invalidSession();
    return user;
  }

  return {
    async register(input: RegisterInput): Promise<Session> {
      if (repos.users.findByEmail(input.email)) {
        throw new AppError("CONFLICT", "Já existe uma conta com este e-mail");
      }
      const inviteCode = input.role === "worker" ? input.inviteCode : undefined;
      if (inviteCode && !resolveInvite(deps, inviteCode)) {
        throw fieldError("inviteCode", "Código de convite inválido ou expirado");
      }

      const passwordHash = await hashPassword(input.password);
      const id = newId();
      const createdAt = nowIso(deps);
      try {
        repos.tx(() => {
          repos.users.insert({
            id,
            email: input.email,
            name: input.name,
            role: input.role,
            passwordHash,
            createdAt,
          });
          if (input.role === "employer") {
            repos.households.insert({
              id: newId(),
              ownerId: id,
              name: "Minha casa",
              timezone: DEFAULT_TIMEZONE,
              createdAt,
            });
          }
          audit(deps, {
            actorId: id,
            contractId: null,
            action: "auth.register",
            entity: "user",
            entityId: id,
          });
          if (inviteCode) linkWorkerByCode(deps, id, inviteCode);
        });
      } catch (err) {
        if (isUniqueViolation(err))
          throw new AppError("CONFLICT", "Já existe uma conta com este e-mail");
        throw err;
      }
      return issueSession(loadUser(id));
    },

    async login(email: string, password: string): Promise<Session> {
      const user = repos.users.findByEmail(email);
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
        const lockedUntil = repos.users.recordLoginFailure(user.id, LOCK_THRESHOLD, at(LOCK_MS));
        if (lockedUntil) {
          audit(deps, {
            actorId: user.id,
            contractId: null,
            action: "auth.locked",
            entity: "user",
            entityId: user.id,
          });
          throw locked();
        }
        throw invalidCredentials();
      }

      repos.users.clearLoginFailures(user.id);
      audit(deps, {
        actorId: user.id,
        contractId: null,
        action: "auth.login",
        entity: "user",
        entityId: user.id,
      });
      return issueSession(user);
    },

    async refresh(rawToken: string | undefined): Promise<Session> {
      if (!rawToken) throw invalidSession();
      const tokenHash = sha256(rawToken);
      const record = repos.refreshTokens.findByHash(tokenHash);
      if (!record) throw invalidSession();

      const now = nowIso(deps);
      if (!record.revokedAt) {
        if (record.expiresAt <= now) throw invalidSession();
        if (repos.refreshTokens.revoke(record.id, now, "rotated")) {
          return issueSession(loadUser(record.userId), record.familyId);
        }
      }

      // Re-read: if the revoke above lost a race, the winner's revocation is what matters.
      const revoked = repos.refreshTokens.findByHash(tokenHash) ?? record;
      if (isBenignReplay(revoked, now)) {
        return issueSession(loadUser(revoked.userId), revoked.familyId);
      }

      // A rotated token showing up again means it was copied: kill every token descended from the same login.
      repos.refreshTokens.revokeFamily(record.familyId, now, "reuse");
      audit(deps, {
        actorId: record.userId,
        contractId: null,
        action: "auth.refresh_reuse",
        entity: "user",
        entityId: record.userId,
      });
      deps.logger.warn("refresh token reuse detected", {
        userId: record.userId,
        familyId: record.familyId,
      });
      throw invalidSession();
    },

    logout(rawToken: string | undefined): void {
      if (!rawToken) return;
      const record = repos.refreshTokens.findByHash(sha256(rawToken));
      if (record) repos.refreshTokens.revokeFamily(record.familyId, nowIso(deps), "logout");
    },

    logoutAll(actor: Actor): void {
      repos.tx(() => {
        repos.refreshTokens.revokeAllForUser(actor.id, nowIso(deps), "logout_all");
        repos.users.bumpTokenVersion(actor.id);
      });
    },

    async forgotPassword(email: string): Promise<void> {
      const user = repos.users.findByEmail(email);
      if (!user) return;
      const token = randomToken();
      repos.passwordResets.replace({
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
      const userId = repos.passwordResets.findValidUserId(tokenHash, nowIso(deps));
      if (!userId) throw expired();
      const passwordHash = await hashPassword(password);
      repos.tx(() => {
        if (!repos.passwordResets.markUsed(tokenHash, nowIso(deps))) throw expired();
        repos.users.setPassword(userId, passwordHash);
        repos.refreshTokens.revokeAllForUser(userId, nowIso(deps), "password_reset");
        audit(deps, {
          actorId: userId,
          contractId: null,
          action: "auth.password_reset",
          entity: "user",
          entityId: userId,
        });
      });
    },

    /**
     * Anonymises instead of deleting so the other party keeps their records:
     * an employer's contracts are archived, a worker is unlinked from theirs.
     */
    async deleteAccount(actor: Actor, password: string): Promise<void> {
      requirePermission(actor, "account:delete");
      const user = loadUser(actor.id);
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw fieldError("password", "Senha incorreta");
      }
      const now = nowIso(deps);
      repos.tx(() => {
        if (user.role === "employer") {
          for (const { contract } of repos.contracts.listForEmployer(user.id)) {
            repos.contracts.setArchivedAt(contract.id, now);
            repos.invites.deleteForContract(contract.id);
            audit(deps, {
              actorId: user.id,
              contractId: contract.id,
              action: "contract.archive",
              entity: "contract",
              entityId: contract.id,
            });
          }
        } else {
          for (const { contract } of repos.contracts.listForWorker(user.id, true)) {
            audit(deps, {
              actorId: user.id,
              contractId: contract.id,
              action: "contract.worker_left",
              entity: "contract",
              entityId: contract.id,
            });
          }
          repos.contracts.unlinkWorker(user.id);
        }
        repos.refreshTokens.revokeAllForUser(user.id, now, "account_deleted");
        repos.passwordResets.deleteForUser(user.id);
        repos.users.anonymize(user.id, `excluida-${user.id}@conta-excluida.invalid`);
        audit(deps, {
          actorId: user.id,
          contractId: null,
          action: "auth.delete_account",
          entity: "user",
          entityId: user.id,
        });
      });
    },

    async changePassword(
      actor: Actor,
      currentPassword: string,
      newPassword: string,
    ): Promise<Session> {
      const user = loadUser(actor.id);
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw fieldError("currentPassword", "Senha atual incorreta");
      }
      const passwordHash = await hashPassword(newPassword);
      repos.tx(() => {
        repos.users.setPassword(user.id, passwordHash);
        repos.refreshTokens.revokeAllForUser(user.id, nowIso(deps), "password_change");
        audit(deps, {
          actorId: user.id,
          contractId: null,
          action: "auth.password_change",
          entity: "user",
          entityId: user.id,
        });
      });
      return issueSession(loadUser(user.id));
    },

    /** Validates an access token and checks it was not invalidated by a token-version bump. */
    async authenticate(accessToken: string): Promise<Actor> {
      const claims = await tokens.verify(accessToken);
      const user = repos.users.findById(claims.sub);
      if (!user || user.tokenVersion !== claims.tv || user.role !== claims.role)
        throw invalidSession();
      return toPublicUser(user);
    },
  };
}
