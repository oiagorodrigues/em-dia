import {
  countsAsPaid,
  formatCents,
  handsMoney,
  isSalaried,
  PAYMENT_KIND_DUE_SIGN,
  PAYMENT_KIND_LABEL,
  PAYMENT_KINDS,
  salaryPerMonthCents,
  nightBonusCents,
  toYearMonth,
  workedDayCents,
  type Contract,
  type CreatePaymentInput,
  type IsoDate,
  type Payment,
  type WorkEntry,
  type PaymentKind,
  type PaymentMethod,
  type YearMonth,
} from "@emdia/shared";
import { formatDateShort } from "./format.ts";
import type { Tone } from "./tone.ts";

export interface PaymentRow {
  payment: Payment;
  contract: Contract;
  /**
   * What a compensation pays down: the agreement's description ("Mesa de jantar") or the
   * adiantamento it abates ("Adiantamento de 15/09/2026").
   */
  agreement?: string | null;
}

/** "recebido" is the worker's word; the employer closing it without waiting reads "concluído". */
export function receivedStatus(p: Pick<Payment, "acknowledgedAt" | "acknowledgedByRole">): {
  label: string;
  tone: Tone;
  done: boolean;
} {
  if (!p.acknowledgedAt) return { label: "Aguardando", tone: "amber", done: false };
  if (p.acknowledgedByRole === "employer") return { label: "Concluído", tone: "brand", done: true };
  return { label: "Recebido", tone: "brand", done: true };
}

/** Options of the "Tipo" field, in the order the form shows them. */
export const KIND_OPTIONS = PAYMENT_KINDS.map((k) => ({ value: k, label: PAYMENT_KIND_LABEL[k] }));

/** What each kind does to the month, said once for the form and the list. */
export const KIND_HINT: Record<PaymentKind, string> = {
  pay: "Paga as diárias ou o salário do mês.",
  bonus:
    "Dinheiro a mais, como uma festa ou um sábado. Entra no valor do mês e já conta como pago.",
  transport: "Dinheiro da passagem. Entra no valor do mês e já conta como pago.",
  advance:
    "Dinheiro adiantado. Não muda o mês agora: depois, no cartão, abata os dias trabalhados dele.",
  deduction: "Não é dinheiro entregue: só diminui o valor a pagar do mês. Não tem recibo.",
};

const KIND_NOUN: Record<PaymentKind, string> = {
  pay: "pagamento",
  bonus: "gratificação",
  transport: "vale-transporte",
  advance: "adiantamento",
  deduction: "desconto",
};

/** What to call the entry in a sentence: "Remover desconto", "Excluir abatimento de R$ 180". */
export function kindNoun(p: Pick<Payment, "kind" | "advanceId">): string {
  return p.advanceId ? "abatimento" : KIND_NOUN[p.kind];
}

/** Desconto lowers the month; every other kind reads as a positive amount. */
export function signedCents(p: Pick<Payment, "kind" | "amountCents">): number {
  return PAYMENT_KIND_DUE_SIGN[p.kind] < 0 ? -p.amountCents : p.amountCents;
}

/** "− R$ 50,00" for a desconto, "R$ 50,00" otherwise; the minus is a real minus sign. */
export function formatSigned(p: Pick<Payment, "kind" | "amountCents">): string {
  const cents = signedCents(p);
  return cents < 0 ? `− ${formatCents(-cents)}` : formatCents(cents);
}

export function kindTone(kind: PaymentKind): Tone {
  if (kind === "deduction") return "coral";
  if (kind === "advance") return "amber";
  return "neutral";
}

/** "restam R$ 180,00 de R$ 360,00", or "todo abatido". */
export function advanceProgress(p: Pick<Payment, "amountCents" | "remainingCents">): string {
  const remaining = p.remainingCents ?? 0;
  if (remaining === 0) return `Todo abatido (${formatCents(p.amountCents)})`;
  return `Restam ${formatCents(remaining)} de ${formatCents(p.amountCents)}`;
}

/** "Adiantamento de 15/09" for an abatement, given the advances it may point at. */
export function abatementLabel(
  p: Pick<Payment, "advanceId">,
  advances: readonly Pick<Payment, "id" | "paidOn">[],
): string | null {
  if (!p.advanceId) return null;
  const advance = advances.find((a) => a.id === p.advanceId);
  return advance ? `Adiantamento de ${formatDateShort(advance.paidOn)}` : "Adiantamento";
}

/** Filters of the Pagamentos page; "" means "todos". */
export interface PaymentFilters {
  pessoa: string;
  tipo: string;
  forma: string;
  recebido: string;
}

export function matchesPaymentFilters(row: PaymentRow, f: Partial<PaymentFilters>): boolean {
  return (!f.pessoa || row.contract.id === f.pessoa) && matchesPaymentFields(row.payment, f);
}

/** The filters that look at the payment alone, shared by the team and the person's tables. */
export function matchesPaymentFields(
  p: Payment,
  f: Partial<Pick<PaymentFilters, "tipo" | "forma" | "recebido">>,
): boolean {
  if (f.tipo && p.kind !== f.tipo) return false;
  if (f.forma && p.method !== f.forma) return false;
  // "Recebido" only asks about money handed over; a desconto is neither.
  if (f.recebido && !handsMoney(p)) return false;
  if (f.recebido === "sim" && !p.acknowledgedAt) return false;
  if (f.recebido === "nao" && p.acknowledgedAt) return false;
  return true;
}

export interface PaymentTotals {
  count: number;
  /** What counts as paid: adiantamentos only through their abated days, descontos never. */
  cents: number;
  /** Entries where money changed hands, the only ones that take a "recebi". */
  money: number;
  acknowledged: number;
}

export function paymentTotals(rows: readonly PaymentRow[]): PaymentTotals {
  return rows.reduce(
    (t, r) => ({
      count: t.count + 1,
      cents: t.cents + (countsAsPaid(r.payment) ? r.payment.amountCents : 0),
      money: t.money + (handsMoney(r.payment) ? 1 : 0),
      acknowledged: t.acknowledged + (r.payment.acknowledgedAt ? 1 : 0),
    }),
    { count: 0, cents: 0, money: 0, acknowledged: 0 },
  );
}

/** Multipart body of POST /payments. The API rejects empty optional fields, so they are left out. */
export function paymentFormData(input: CreatePaymentInput, receipt: File | null): FormData {
  const form = new FormData();
  form.append("kind", input.kind);
  form.append("referenceMonth", input.referenceMonth);
  form.append("paidOn", input.paidOn);
  form.append("amountCents", String(input.amountCents));
  if (input.method) form.append("method", input.method);
  if (input.note) form.append("note", input.note);
  if (input.agreementId) form.append("agreementId", input.agreementId);
  if (input.advanceId) form.append("advanceId", input.advanceId);
  if (receipt && input.method) form.append("receipt", receipt);
  return form;
}

export interface DayPaymentDraft {
  kind: PaymentKind;
  referenceMonth: YearMonth;
  paidOn: IsoDate;
  amountCents: number | null;
  method: PaymentMethod;
}

/**
 * Paying a day from the day editor: it counts in that day's month, is paid today, and comes
 * with what the day is worth. A salary isn't paid by the day, so its amount starts empty.
 */
export function dayPaymentDraft(
  contract: Pick<Contract, "payType">,
  date: IsoDate,
  today: IsoDate,
  dayValue: number | null,
): DayPaymentDraft {
  return {
    kind: "pay",
    referenceMonth: toYearMonth(date),
    paidOn: today,
    amountCents: isSalaried(contract.payType) ? null : dayValue,
    method: "pix",
  };
}

export type DayValueContract = Pick<
  Contract,
  "payType" | "rateCents" | "expectedStart" | "expectedEnd" | "nightBonus"
>;
export type WorkedDay = Pick<
  WorkEntry,
  "date" | "checkIn" | "checkOut" | "checkOutDate" | "breakMinutes" | "minutes"
>;

/**
 * What one worked day is worth: what it adds to the month (see `workedDayCents`) plus its
 * adicional noturno, or for a salary a thirtieth of the month (the same rate absences use).
 * Null for an hourly or plantão day with no hours yet.
 */
export function dayValueCents(contract: DayValueContract, day: WorkedDay): number | null {
  const night = nightBonusCents(contract, { ...day, status: "worked" });
  const salary = salaryPerMonthCents(contract.payType, contract.rateCents);
  if (salary !== null) return Math.round(salary / 30) + night;
  if ((contract.payType === "hourly" || contract.payType === "shift") && day.minutes <= 0)
    return null;
  return workedDayCents(contract, day)! + night;
}

/** Years with possible payments, newest first: from the oldest contract start up to this year. */
export function paymentYears(
  contracts: readonly Pick<Contract, "startedOn">[],
  thisYear: number,
): number[] {
  const first = contracts.reduce(
    (min, c) => Math.min(min, Number(c.startedOn.slice(0, 4))),
    thisYear,
  );
  return Array.from({ length: thisYear - first + 1 }, (_, i) => thisYear - i);
}
