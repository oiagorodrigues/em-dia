import { initial } from "./001-initial.ts";
import { refreshRevokeReason } from "./002-refresh-revoke-reason.ts";
import { flexibleSchedule } from "./003-flexible-schedule.ts";
import { teamManagement } from "./004-team-management.ts";
import { agreements } from "./005-agreements.ts";

export interface Migration {
  id: string;
  sql: string;
}

/** Append only. Never edit a migration that has shipped. */
export const migrations: Migration[] = [
  initial,
  refreshRevokeReason,
  flexibleSchedule,
  teamManagement,
  agreements,
];
