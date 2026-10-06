import type { Migration } from "./index.ts";

/** Rows revoked before this migration keep a NULL reason and are treated as non-rotation revocations. */
export const refreshRevokeReason: Migration = {
  id: "002-refresh-revoke-reason",
  sql: `ALTER TABLE refresh_tokens ADD COLUMN revoked_reason TEXT;`,
};
