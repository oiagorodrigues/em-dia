import { initial } from "./001-initial.ts";
import { refreshRevokeReason } from "./002-refresh-revoke-reason.ts";

export interface Migration {
  id: string;
  sql: string;
}

/** Append only. Never edit a migration that has shipped. */
export const migrations: Migration[] = [initial, refreshRevokeReason];
