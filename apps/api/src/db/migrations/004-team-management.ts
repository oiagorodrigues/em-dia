import type { Migration } from "./index.ts";

export const teamManagement: Migration = {
  id: "004-team-management",
  sql: `
ALTER TABLE contracts ADD COLUMN archived_at TEXT;
ALTER TABLE contracts ADD COLUMN contact_email TEXT;
ALTER TABLE contracts ADD COLUMN contact_phone TEXT;
`,
};
