import { execute, queryOne, type Db } from "../db/index.ts";

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

export function refreshTokensRepo(db: Db) {
  return {
    insert(t: {
      id: string;
      userId: string;
      familyId: string;
      tokenHash: string;
      expiresAt: string;
      createdAt: string;
    }) {
      execute(
        db,
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

    findByHash(tokenHash: string): RefreshTokenRecord | undefined {
      const r = queryOne<Row>(
        db,
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
    revoke(id: string, at: string, reason: RevokeReason): boolean {
      return (
        execute(
          db,
          "UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL",
          at,
          reason,
          id,
        ) > 0
      );
    },

    revokeFamily(familyId: string, at: string, reason: RevokeReason): void {
      execute(
        db,
        "UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ? WHERE family_id = ? AND revoked_at IS NULL",
        at,
        reason,
        familyId,
      );
    },

    revokeAllForUser(userId: string, at: string, reason: RevokeReason): void {
      execute(
        db,
        "UPDATE refresh_tokens SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL",
        at,
        reason,
        userId,
      );
    },

    /** True once any token in the family was revoked for a reason other than normal rotation. */
    isFamilyRevoked(familyId: string): boolean {
      return (
        queryOne<{ hit: number }>(
          db,
          `SELECT 1 AS hit FROM refresh_tokens
           WHERE family_id = ? AND revoked_at IS NOT NULL AND (revoked_reason IS NULL OR revoked_reason != 'rotated')
           LIMIT 1`,
          familyId,
        ) !== undefined
      );
    },
  };
}
