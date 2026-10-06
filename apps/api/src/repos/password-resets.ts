import { and, eq, gt, isNull } from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { passwordResets } from "../db/schema.ts";
import { date } from "./convert.ts";

export function passwordResetsRepo(db: Executor) {
  return {
    /** Issuing a new link invalidates any earlier one. */
    async replace(r: {
      tokenHash: string;
      userId: string;
      expiresAt: string;
      createdAt: string;
    }): Promise<void> {
      await db.delete(passwordResets).where(eq(passwordResets.userId, r.userId));
      await db
        .insert(passwordResets)
        .values({ ...r, expiresAt: date(r.expiresAt), createdAt: date(r.createdAt) });
    },

    async findValidUserId(tokenHash: string, now: string): Promise<string | undefined> {
      const [row] = await db
        .select({ userId: passwordResets.userId })
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.tokenHash, tokenHash),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, date(now)),
          ),
        );
      return row?.userId;
    },

    async deleteForUser(userId: string): Promise<void> {
      await db.delete(passwordResets).where(eq(passwordResets.userId, userId));
    },

    async markUsed(tokenHash: string, at: string): Promise<boolean> {
      const rows = await db
        .update(passwordResets)
        .set({ usedAt: date(at) })
        .where(and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt)))
        .returning({ tokenHash: passwordResets.tokenHash });
      return rows.length > 0;
    },
  };
}
