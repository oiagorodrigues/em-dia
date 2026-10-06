import type { Migration } from "./index.ts";

export const agreements: Migration = {
  id: "005-agreements",
  sql: `
CREATE TABLE agreements (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  installment_cents INTEGER CHECK (installment_cents IS NULL OR installment_cents > 0),
  start_month TEXT NOT NULL,
  accepted_at TEXT,
  cancelled_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX agreements_contract ON agreements(contract_id, created_at);

ALTER TABLE payments ADD COLUMN agreement_id TEXT REFERENCES agreements(id) ON DELETE SET NULL;
CREATE INDEX payments_agreement ON payments(agreement_id);
`,
};
