import type { Executor } from "../db/index.ts";

export type RevokeReason =
  | "rotated"
  | "reuse"
  | "logout"
  | "logout_all"
  | "password_change"
  | "password_reset"
  | "account_deleted";

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: RevokeReason | null;
}

interface Row {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: RevokeReason | null;
}

export function refreshTokensRepo(db: Executor) {
  return {
    async insert(t: {
      id: string;
      userId: string;
      familyId: string;
      tokenHash: string;
      expiresAt: string;
      createdAt: string;
    }) {
      await db.run(
        `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        t.id,
        t.userId,
        t.familyId,
        t.tokenHash,
        t.expiresAt,
        t.createdAt,
      );
    },

    async findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
      const r = await db.get<Row>(
        `SELECT id, user_id, family_id, expires_at, revoked_at, revoked_reason
         FROM refresh_tokens WHERE token_hash = ?`,
        tokenHash,
      );
      return (
        r && {
          id: r.id,
          userId: r.user_id,
          familyId: r.family_id,
          expiresAt: r.expires_at,
          revokedAt: r.revoked_at,
          revokedReason: r.revoked_reason,
        }
      );
    },

    /** Returns false when the token was already revoked (a concurrent rotation won). */
    async revoke(id: string, at: string, reason: RevokeReason): Promise<boolean> {
      return (
        (await db.run(
          "UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL",
          at,
          reason,
          id,
        )) > 0
      );
    },

    async revokeFamily(familyId: string, at: string, reason: RevokeReason): Promise<void> {
      await db.run(
        "UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ? WHERE family_id = ? AND revoked_at IS NULL",
        at,
        reason,
        familyId,
      );
    },

    async revokeAllForUser(userId: string, at: string, reason: RevokeReason): Promise<void> {
      await db.run(
        "UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL",
        at,
        reason,
        userId,
      );
    },

    /** True once any token in the family was revoked for a reason other than normal rotation. */
    async isFamilyRevoked(familyId: string): Promise<boolean> {
      return (
        (await db.get<{ hit: number }>(
          `SELECT 1 AS hit FROM refresh_tokens
           WHERE family_id = ? AND revoked_at IS NOT NULL AND (revoked_reason IS NULL OR revoked_reason != 'rotated')
           LIMIT 1`,
          familyId,
        )) !== undefined
      );
    },
  };
}
