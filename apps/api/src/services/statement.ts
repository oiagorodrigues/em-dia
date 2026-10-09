import type {
  ClockTime,
  Contract,
  IsoDate,
  MonthSummary,
  Payment,
  WorkEntry,
  YearMonth,
} from "@emdia/shared";
import {
  describeSchedule,
  ENTRY_STATUS_LABEL,
  formatDuration,
  formatYearMonth,
  handsMoney,
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  weekdayOf,
} from "@emdia/shared";
import { centsToDecimal, toCsv } from "../lib/csv.ts";

/** Everything the month statement shows, in CSV or PDF. */
export interface StatementData {
  month: YearMonth;
  contract: Contract;
  summary: MonthSummary;
  /** Every date of the month, in order. */
  days: StatementDay[];
  /** Oldest first. */
  payments: StatementPayment[];
  /** What every adiantamento of the contract still has to abate, not only this month's. */
  openAdvancesCents: number;
  generatedAt: { date: IsoDate; time: ClockTime };
}

export interface StatementDay {
  date: IsoDate;
  entry: WorkEntry | null;
  expected: boolean;
  /** Expected up to today with no entry. */
  unrecorded: boolean;
}

export interface StatementPayment {
  payment: Payment;
  /** The agreement or adiantamento a compensation pays down. */
  source: string | null;
}

export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const brDate = (date: IsoDate) => date.split("-").reverse().join("/");

export function dayStatus(day: StatementDay): string {
  if (day.entry) return ENTRY_STATUS_LABEL[day.entry.status];
  return day.unrecorded ? "Não registrado" : "";
}

export function checkOutText(entry: WorkEntry, date: (d: IsoDate) => string = brDate): string {
  if (!entry.checkOut) return "";
  return entry.checkOutDate ? `${date(entry.checkOutDate)} ${entry.checkOut}` : entry.checkOut;
}

export function paymentMethodText({ payment, source }: StatementPayment): string {
  const method = payment.method ? PAYMENT_METHOD_LABEL[payment.method] : "";
  return source ? `${method}: ${source}` : method;
}

export function statementCsv(data: StatementData): string {
  const { contract, summary } = data;
  const days = data.days.map((day) => {
    const e = day.entry;
    return [
      brDate(day.date),
      WEEKDAY_SHORT[weekdayOf(day.date)] ?? "",
      day.expected ? "Sim" : "",
      dayStatus(day),
      e?.checkIn ?? "",
      e ? checkOutText(e) : "",
      e && e.status === "worked" ? e.breakMinutes : "",
      e && e.minutes > 0 ? formatDuration(e.minutes) : "",
      e ? (e.confirmedAt ? "Sim" : "Não") : "",
      e?.note ?? "",
    ];
  });
  const payments = data.payments.map((item) => {
    const p = item.payment;
    return [
      brDate(p.paidOn),
      PAYMENT_KIND_LABEL[p.kind],
      paymentMethodText(item),
      centsToDecimal(p.amountCents),
      handsMoney(p) ? (p.acknowledgedAt ? "Sim" : "Não") : "",
      p.note ?? "",
    ];
  });

  return toCsv([
    ["Extrato", formatYearMonth(data.month)],
    ["Profissional", contract.workerName],
    ["Contratante", contract.employerName],
    ["Casa", contract.householdName],
    ["Combinado", describeSchedule(contract.schedule)],
    [],
    [
      "Data",
      "Dia",
      "Previsto",
      "Situação",
      "Entrada",
      "Saída",
      "Pausa (min)",
      "Horas",
      "Confirmado",
      "Observação",
    ],
    ...days,
    [],
    ["Dias previstos", summary.expectedDays],
    ["Dias trabalhados", summary.daysWorked],
    ["Horas trabalhadas", formatDuration(summary.totalMinutes)],
    ["Faltas", summary.absences],
    ["Faltas justificadas", summary.excused],
    ["Valor bruto (R$)", centsToDecimal(summary.grossCents)],
    ["Desconto por faltas (R$)", centsToDecimal(summary.absenceDeductionCents)],
    ["Adicional noturno (R$)", centsToDecimal(summary.nightBonusCents)],
    ["Gratificações, vale-transporte e descontos (R$)", centsToDecimal(summary.adjustmentsCents)],
    ["Total devido (R$)", centsToDecimal(summary.dueCents)],
    ["Pago (R$)", centsToDecimal(summary.paidCents)],
    ["Saldo (R$)", centsToDecimal(summary.balanceCents)],
    ["Adiantamentos ainda a abater (R$)", centsToDecimal(data.openAdvancesCents)],
    [],
    ["Pagamentos"],
    ["Data", "Tipo", "Forma", "Valor (R$)", "Recebido", "Observação"],
    ...payments,
  ]);
}
