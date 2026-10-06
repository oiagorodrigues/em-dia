import { execute, queryOne, type Db } from "../db/index.ts";

export function passwordResetsRepo(db: Db) {
  return {
    /** Issuing a new link invalidates any earlier one. */
    replace(r: { tokenHash: string; userId: string; expiresAt: string; createdAt: string }): void {
      execute(db, "DELETE FROM password_resets WHERE user_id = ?", r.userId);
      execute(
        db,
        "INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        r.tokenHash,
        r.userId,
        r.expiresAt,
        r.createdAt,
      );
    },

    findValidUserId(tokenHash: string, now: string): string | undefined {
      return queryOne<{ user_id: string }>(
        db,
        "SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
        tokenHash,
        now,
      )?.user_id;
    },

    markUsed(tokenHash: string, at: string): boolean {
      return (
        execute(
          db,
          "UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL",
          at,
          tokenHash,
        ) > 0
      );
    },
  };
}
