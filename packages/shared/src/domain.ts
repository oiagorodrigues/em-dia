import type { MonthEstimate } from "./estimate.ts";
import type { Schedule } from "./schedule.ts";

export const ROLES = ["employer", "worker"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  employer: "Contratante",
  worker: "Profissional",
};

export const OCCUPATIONS = [
  "diarista",
  "faxineira",
  "baba",
  "cuidadora",
  "cozinheira",
  "jardineiro",
  "motorista",
  "passadeira",
  "outro",
] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

export const OCCUPATION_LABEL: Record<Occupation, string> = {
  diarista: "Diarista",
  faxineira: "Faxineira",
  baba: "Babá",
  cuidadora: "Cuidadora",
  cozinheira: "Cozinheira",
  jardineiro: "Jardineiro",
  motorista: "Motorista",
  passadeira: "Passadeira",
  outro: "Outro",
};

/** hourly: rate per hour · daily: rate per day worked · monthly: fixed rate per month */
export const PAY_TYPES = ["hourly", "daily", "monthly"] as const;
export type PayType = (typeof PAY_TYPES)[number];

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  hourly: "Por hora",
  daily: "Por diária",
  monthly: "Mensal",
};

export const ENTRY_STATUSES = ["worked", "absent", "excused", "day_off", "holiday"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  worked: "Trabalhou",
  absent: "Faltou",
  excused: "Falta justificada",
  day_off: "Folga",
  holiday: "Feriado",
};

/**
 * What an entry of the payments list is. "pay" settles diárias or salary; gratificação
 * and vale-transporte are money handed on top of the pay; an adiantamento is money
 * handed ahead and paid down with work days; a desconto only lowers what is due.
 */
export const PAYMENT_KINDS = ["pay", "bonus", "transport", "advance", "deduction"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  pay: "Diárias/salário",
  bonus: "Gratificação",
  transport: "Vale-transporte",
  advance: "Adiantamento",
  deduction: "Desconto",
};

/** How an entry of each kind moves the month's amount due. */
export const PAYMENT_KIND_DUE_SIGN: Record<PaymentKind, 1 | 0 | -1> = {
  pay: 0,
  bonus: 1,
  transport: 1,
  advance: 0,
  deduction: -1,
};

/** compensation: settled with something other than money (see Agreement). */
export const PAYMENT_METHODS = ["pix", "cash", "transfer", "compensation", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  transfer: "Transferência",
  compensation: "Compensação",
  other: "Outro",
};

export const CONTRACT_STATUSES = ["active", "ended"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/** ISO date "YYYY-MM-DD" */
export type IsoDate = string;
/** "YYYY-MM" */
export type YearMonth = string;
/** "HH:MM" 24h */
export type ClockTime = string;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
  pixKey: string | null;
  createdAt: string;
}

export interface Household {
  id: string;
  ownerId: string;
  name: string;
  timezone: string;
  createdAt: string;
}

export interface Contract {
  id: string;
  householdId: string;
  householdName: string;
  employerId: string;
  employerName: string;
  workerId: string | null;
  workerName: string;
  /** From the linked worker's profile; null until linked or when not set. */
  workerPhone: string | null;
  workerPixKey: string | null;
  /** Contact typed by the employer before the worker has an account; used to send the invite. */
  contactEmail: string | null;
  contactPhone: string | null;
  occupation: Occupation;
  payType: PayType;
  rateCents: number;
  /** When the worker is expected to come (see schedule.ts). */
  schedule: Schedule;
  /** monthly pay only: unjustified absences are deducted at rate / 30 each. */
  deductAbsences: boolean;
  expectedStart: ClockTime | null;
  expectedEnd: ClockTime | null;
  startedOn: IsoDate;
  endedOn: IsoDate | null;
  status: ContractStatus;
  /** Logical removal by the employer: hidden from lists, kept for history, restorable. */
  archivedAt: string | null;
  createdAt: string;
}

export interface WorkEntry {
  id: string;
  contractId: string;
  date: IsoDate;
  status: EntryStatus;
  checkIn: ClockTime | null;
  checkOut: ClockTime | null;
  breakMinutes: number;
  /** Derived: worked minutes (0 unless status = worked with both times). */
  minutes: number;
  note: string | null;
  createdBy: string;
  createdByRole: Role;
  confirmedBy: string | null;
  confirmedAt: string | null;
  updatedAt: string;
}

export interface Receipt {
  mimeType: ReceiptMimeType;
  sizeBytes: number;
  originalName: string;
  uploadedAt: string;
}

export interface Payment {
  id: string;
  contractId: string;
  referenceMonth: YearMonth;
  paidOn: IsoDate;
  amountCents: number;
  kind: PaymentKind;
  /**
   * How the money was handed. Null when no money changed hands in this entry: always
   * for a desconto, and for gratificações migrated from the old Extras tab, whose
   * money went out inside another payment.
   */
  method: PaymentMethod | null;
  note: string | null;
  receipt: Receipt | null;
  /** Set when the payment pays down an agreement (method = compensation). */
  agreementId: string | null;
  /** Set when the payment abates work days from an adiantamento (method = compensation). */
  advanceId: string | null;
  /** Derived, adiantamentos only: sum of the payments that abate it; null for other kinds. */
  settledCents: number | null;
  /** Derived, adiantamentos only: max(0, amountCents - settledCents); null for other kinds. */
  remainingCents: number | null;
  /** When the payment was confirmed: the worker's "recebi", or the employer closing it. */
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedByRole: Role | null;
  createdBy: string;
  createdAt: string;
}

/**
 * Something the worker owes the household and pays back in work, e.g. a dining
 * table bought from the employer and settled in installments of R$ 200 a month.
 * Each installment is a Payment with method "compensation" and this agreementId.
 */
export interface Agreement {
  id: string;
  contractId: string;
  description: string;
  totalCents: number;
  /** Suggested amount per month; null when settled ad hoc. */
  installmentCents: number | null;
  startMonth: YearMonth;
  /** Derived: sum of compensation payments linked to this agreement. */
  settledCents: number;
  /** Derived: max(0, totalCents - settledCents). */
  remainingCents: number;
  /** When the worker confirmed they agree. */
  acceptedAt: string | null;
  cancelledAt: string | null;
  /** Removed by the employer; its compensation payments are hidden until it is restored. */
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  at: string;
}

export interface MonthSummary {
  month: YearMonth;
  payType: PayType;
  rateCents: number;
  totalMinutes: number;
  daysWorked: number;
  absences: number;
  excused: number;
  daysOff: number;
  holidays: number;
  /** Days the worker is expected this month (dates, or the visit count for per_month). */
  expectedDays: number;
  /** Expected dates this month; empty for per_month and on_demand schedules. */
  expectedDates: IsoDate[];
  /** Expected dates up to `today` with no entry at all. */
  unrecordedDates: IsoDate[];
  /** Entries awaiting the other party's confirmation. */
  pendingConfirmation: number;
  grossCents: number;
  /** Subtracted from monthly pay for unjustified absences when deductAbsences is on. */
  absenceDeductionCents: number;
  /** Gratificações and vale-transporte minus descontos (`PAYMENT_KIND_DUE_SIGN`). */
  adjustmentsCents: number;
  dueCents: number;
  paidCents: number;
  /** dueCents - paidCents. Positive = still owed to the worker. */
  balanceCents: number;
  /** (grossCents - absenceDeductionCents) / daysWorked, 0 when no days. */
  avgPerDayCents: number;
  /** (grossCents - absenceDeductionCents) per hour actually worked, 0 when no minutes. */
  effectiveHourlyCents: number;
}

export interface InviteDelivery {
  code: string;
  expiresAt: string;
  /** Link the worker opens to sign up with the code prefilled. */
  signupUrl: string;
  /** True when an e-mail with the link was handed to the mail transport. */
  emailSent: boolean;
  /** wa.me link with the message prefilled, when a phone is known. The employer taps it to send. */
  whatsappUrl: string | null;
}

export interface DashboardItem {
  contract: Contract;
  summary: MonthSummary;
  /** What the month should cost if every expected day happens; drives future-month projections. */
  estimate: MonthEstimate;
  today: WorkEntry | null;
  lastPayment: Payment | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
