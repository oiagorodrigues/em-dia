import type { Executor } from "../db/index.ts";

export function passwordResetsRepo(db: Executor) {
  return {
    /** Issuing a new link invalidates any earlier one. */
    async replace(r: {
      tokenHash: string;
      userId: string;
      expiresAt: string;
      createdAt: string;
    }): Promise<void> {
      await db.run("DELETE FROM password_resets WHERE user_id = ?", r.userId);
      await db.run(
        "INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        r.tokenHash,
        r.userId,
        r.expiresAt,
        r.createdAt,
      );
    },

    async findValidUserId(tokenHash: string, now: string): Promise<string | undefined> {
      const row = await db.get<{ user_id: string }>(
        "SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
        tokenHash,
        now,
      );
      return row?.user_id;
    },

    async deleteForUser(userId: string): Promise<void> {
      await db.run("DELETE FROM password_resets WHERE user_id = ?", userId);
    },

    async markUsed(tokenHash: string, at: string): Promise<boolean> {
      return (
        (await db.run(
          "UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL",
          at,
          tokenHash,
        )) > 0
      );
    },
  };
}
