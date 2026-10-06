import type { Migration } from "./index.ts";

export const initial: Migration = {
  id: "001-initial",
  sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employer', 'worker')),
  phone TEXT,
  pix_key TEXT,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX households_owner ON households(owner_id, created_at);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  worker_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  worker_name TEXT NOT NULL,
  occupation TEXT NOT NULL,
  pay_type TEXT NOT NULL CHECK (pay_type IN ('hourly', 'daily', 'monthly')),
  rate_cents INTEGER NOT NULL CHECK (rate_cents > 0),
  schedule_days TEXT NOT NULL,
  expected_start TEXT,
  expected_end TEXT,
  started_on TEXT NOT NULL,
  ended_on TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX contracts_household ON contracts(household_id);
CREATE INDEX contracts_worker ON contracts(worker_id);

CREATE TABLE invites (
  contract_id TEXT PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE work_entries (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_by_role TEXT NOT NULL,
  confirmed_by TEXT REFERENCES users(id),
  confirmed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (contract_id, date)
) STRICT;

CREATE TABLE adjustments (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX adjustments_contract_month ON adjustments(contract_id, month);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  reference_month TEXT NOT NULL,
  paid_on TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL,
  note TEXT,
  receipt_file TEXT,
  receipt_mime TEXT,
  receipt_size INTEGER,
  receipt_name TEXT,
  receipt_uploaded_at TEXT,
  acknowledged_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX payments_contract_month ON payments(contract_id, reference_month);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  meta TEXT,
  at TEXT NOT NULL
) STRICT;
CREATE INDEX audit_log_contract ON audit_log(contract_id, at);
`,
};
