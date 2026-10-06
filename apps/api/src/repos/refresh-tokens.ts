import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { refreshTokens, type REVOKE_REASONS } from "../db/schema.ts";
import { date, iso, isoOrNull } from "./convert.ts";

export type RevokeReason = (typeof REVOKE_REASONS)[number];

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: RevokeReason | null;
}

export function refreshTokensRepo(db: Executor) {
  const revokeWhere = async (where: ReturnType<typeof eq>, at: string, reason: RevokeReason) => {
    await db
      .update(refreshTokens)
      .set({ revokedAt: date(at), revokedReason: reason })
      .where(and(where, isNull(refreshTokens.revokedAt)));
  };

  return {
    async insert(t: {
      id: string;
      userId: string;
      familyId: string;
      tokenHash: string;
      expiresAt: string;
      createdAt: string;
    }): Promise<void> {
      await db
        .insert(refreshTokens)
        .values({ ...t, expiresAt: date(t.expiresAt), createdAt: date(t.createdAt) });
    },

    async findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
      const [r] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash));
      return (
        r && {
          id: r.id,
          userId: r.userId,
          familyId: r.familyId,
          expiresAt: iso(r.expiresAt),
          revokedAt: isoOrNull(r.revokedAt),
          revokedReason: r.revokedReason,
        }
      );
    },

    /** Returns false when the token was already revoked (a concurrent rotation won). */
    async revoke(id: string, at: string, reason: RevokeReason): Promise<boolean> {
      const rows = await db
        .update(refreshTokens)
        .set({ revokedAt: date(at), revokedReason: reason })
        .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      return rows.length > 0;
    },

    revokeFamily: (familyId: string, at: string, reason: RevokeReason): Promise<void> =>
      revokeWhere(eq(refreshTokens.familyId, familyId), at, reason),

    revokeAllForUser: (userId: string, at: string, reason: RevokeReason): Promise<void> =>
      revokeWhere(eq(refreshTokens.userId, userId), at, reason),

    /** True once any token in the family was revoked for a reason other than normal rotation. */
    async isFamilyRevoked(familyId: string): Promise<boolean> {
      const rows = await db
        .select({ id: refreshTokens.id })
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.familyId, familyId),
            isNotNull(refreshTokens.revokedAt),
            or(isNull(refreshTokens.revokedReason), ne(refreshTokens.revokedReason, "rotated")),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}
