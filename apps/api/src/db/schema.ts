import {
  ADJUSTMENT_KINDS,
  CONTRACT_STATUSES,
  ENTRY_STATUSES,
  OCCUPATIONS,
  PAY_TYPES,
  PAYMENT_METHODS,
  RECEIPT_MIME_TYPES,
  ROLES,
  SCHEDULE_KINDS,
} from "@emdia/shared";
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** CHECK (column IN (...)) from the same constant arrays the zod schemas use. */
function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} IN (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
}

/** Timestamps come back as Date; repos turn them into the ISO strings the domain types use. */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** ISO dates (YYYY-MM-DD) stay strings end to end. */
const isoDate = (name: string) => date(name, { mode: "string" });

const YEAR_MONTH = "^[0-9]{4}-(0[1-9]|1[0-2])$";
const CLOCK = "^([01][0-9]|2[0-3]):[0-5][0-9]$";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    phone: text("phone"),
    pixKey: text("pix_key"),
    passwordHash: text("password_hash").notNull(),
    tokenVersion: integer("token_version").notNull().default(0),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamptz("locked_until"),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [check("users_role_check", oneOf(t.role, ROLES))],
);

export const households = pgTable(
  "households",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [index("households_owner_idx").on(t.ownerId, t.createdAt)],
);

export const contracts = pgTable(
  "contracts",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    workerId: text("worker_id").references(() => users.id, { onDelete: "set null" }),
    workerName: text("worker_name").notNull(),
    occupation: text("occupation", { enum: OCCUPATIONS }).notNull(),
    payType: text("pay_type", { enum: PAY_TYPES }).notNull(),
    rateCents: integer("rate_cents").notNull(),
    scheduleKind: text("schedule_kind", { enum: SCHEDULE_KINDS }).notNull(),
    scheduleWeekdays: jsonb("schedule_weekdays").$type<number[]>().notNull().default([]),
    everyWeeks: integer("every_weeks").notNull().default(1),
    monthDays: jsonb("month_days").$type<number[]>().notNull().default([]),
    visitsPerMonth: integer("visits_per_month"),
    deductAbsences: boolean("deduct_absences").notNull().default(false),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    expectedStart: text("expected_start"),
    expectedEnd: text("expected_end"),
    startedOn: isoDate("started_on").notNull(),
    endedOn: isoDate("ended_on"),
    status: text("status", { enum: CONTRACT_STATUSES }).notNull(),
    archivedAt: timestamptz("archived_at"),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [
    index("contracts_household_idx").on(t.householdId),
    index("contracts_worker_idx").on(t.workerId),
    check("contracts_occupation_check", oneOf(t.occupation, OCCUPATIONS)),
    check("contracts_pay_type_check", oneOf(t.payType, PAY_TYPES)),
    check("contracts_status_check", oneOf(t.status, CONTRACT_STATUSES)),
    check("contracts_schedule_kind_check", oneOf(t.scheduleKind, SCHEDULE_KINDS)),
    check("contracts_rate_check", sql`${t.rateCents} > 0`),
    check("contracts_every_weeks_check", sql`${t.everyWeeks} BETWEEN 1 AND 12`),
    check("contracts_visits_check", sql`${t.visitsPerMonth} BETWEEN 1 AND 31`),
    check("contracts_expected_start_check", sql`${t.expectedStart} ~ ${sql.raw(`'${CLOCK}'`)}`),
    check("contracts_expected_end_check", sql`${t.expectedEnd} ~ ${sql.raw(`'${CLOCK}'`)}`),
  ],
);

/** One live code per contract: regenerating replaces the row. */
export const invites = pgTable("invites", {
  contractId: text("contract_id")
    .primaryKey()
    .references(() => contracts.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: timestamptz("created_at").notNull(),
});

export const workEntries = pgTable(
  "work_entries",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    date: isoDate("date").notNull(),
    status: text("status", { enum: ENTRY_STATUSES }).notNull(),
    checkIn: text("check_in"),
    checkOut: text("check_out"),
    breakMinutes: integer("break_minutes").notNull().default(0),
    minutes: integer("minutes").notNull().default(0),
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdByRole: text("created_by_role", { enum: ROLES }).notNull(),
    confirmedBy: text("confirmed_by").references(() => users.id),
    confirmedAt: timestamptz("confirmed_at"),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (t) => [
    unique("work_entries_contract_date_unique").on(t.contractId, t.date),
    check("work_entries_status_check", oneOf(t.status, ENTRY_STATUSES)),
    check("work_entries_role_check", oneOf(t.createdByRole, ROLES)),
    check("work_entries_check_in_check", sql`${t.checkIn} ~ ${sql.raw(`'${CLOCK}'`)}`),
    check("work_entries_check_out_check", sql`${t.checkOut} ~ ${sql.raw(`'${CLOCK}'`)}`),
    check("work_entries_minutes_check", sql`${t.breakMinutes} >= 0 AND ${t.minutes} >= 0`),
  ],
);

export const adjustments = pgTable(
  "adjustments",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    kind: text("kind", { enum: ADJUSTMENT_KINDS }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [
    index("adjustments_contract_month_idx").on(t.contractId, t.month),
    check("adjustments_kind_check", oneOf(t.kind, ADJUSTMENT_KINDS)),
    check("adjustments_amount_check", sql`${t.amountCents} > 0`),
    check("adjustments_month_check", sql`${t.month} ~ ${sql.raw(`'${YEAR_MONTH}'`)}`),
  ],
);

export const agreements = pgTable(
  "agreements",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    totalCents: integer("total_cents").notNull(),
    installmentCents: integer("installment_cents"),
    startMonth: text("start_month").notNull(),
    acceptedAt: timestamptz("accepted_at"),
    cancelledAt: timestamptz("cancelled_at"),
    archivedAt: timestamptz("archived_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [
    index("agreements_contract_idx").on(t.contractId, t.createdAt),
    check("agreements_total_check", sql`${t.totalCents} > 0`),
    check("agreements_installment_check", sql`${t.installmentCents} > 0`),
    check("agreements_start_month_check", sql`${t.startMonth} ~ ${sql.raw(`'${YEAR_MONTH}'`)}`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    referenceMonth: text("reference_month").notNull(),
    paidOn: isoDate("paid_on").notNull(),
    amountCents: integer("amount_cents").notNull(),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    note: text("note"),
    /** Storage name; it never leaves the API. */
    receiptFile: text("receipt_file"),
    receiptMime: text("receipt_mime", { enum: RECEIPT_MIME_TYPES }),
    receiptSize: integer("receipt_size"),
    receiptName: text("receipt_name"),
    receiptUploadedAt: timestamptz("receipt_uploaded_at"),
    acknowledgedAt: timestamptz("acknowledged_at"),
    agreementId: text("agreement_id").references(() => agreements.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [
    index("payments_contract_month_idx").on(t.contractId, t.referenceMonth),
    index("payments_agreement_idx").on(t.agreementId),
    check("payments_method_check", oneOf(t.method, PAYMENT_METHODS)),
    check("payments_receipt_mime_check", oneOf(t.receiptMime, RECEIPT_MIME_TYPES)),
    check("payments_amount_check", sql`${t.amountCents} > 0`),
    check(
      "payments_reference_month_check",
      sql`${t.referenceMonth} ~ ${sql.raw(`'${YEAR_MONTH}'`)}`,
    ),
  ],
);

export const REVOKE_REASONS = [
  "rotated",
  "reuse",
  "logout",
  "logout_all",
  "password_change",
  "password_reset",
  "account_deleted",
] as const;

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    revokedReason: text("revoked_reason", { enum: REVOKE_REASONS }),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [
    index("refresh_tokens_family_idx").on(t.familyId),
    index("refresh_tokens_user_idx").on(t.userId),
    check("refresh_tokens_reason_check", oneOf(t.revokedReason, REVOKE_REASONS)),
  ],
);

export const passwordResets = pgTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamptz("expires_at").notNull(),
  usedAt: timestamptz("used_at"),
  createdAt: timestamptz("created_at").notNull(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    /** Insertion order, to break ties between events in the same millisecond. */
    seq: integer("seq").generatedAlwaysAsIdentity(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    contractId: text("contract_id").references(() => contracts.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    at: timestamptz("at").notNull(),
  },
  (t) => [index("audit_log_contract_idx").on(t.contractId, t.at)],
);
