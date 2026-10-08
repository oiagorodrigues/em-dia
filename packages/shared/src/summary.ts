import {
  isSalaried,
  PAYMENT_KIND_DUE_SIGN,
  salaryPerMonthCents,
  type Contract,
  type IsoDate,
  type MonthSummary,
  type Payment,
  type WorkEntry,
  type YearMonth,
} from "./domain.ts";
import { countsAsPaid } from "./payment.ts";
import { expectedCountInMonth, expectedDatesInMonth } from "./schedule.ts";
import { shiftMinutes } from "./time.ts";

type DayContract = Pick<Contract, "payType" | "rateCents" | "expectedStart" | "expectedEnd">;

/**
 * The minutes the contract's times add up to, less the day's own break, so a day that keeps
 * the agreed times is worth exactly one diária. Null when the contract has no times.
 */
export function expectedDayMinutes(contract: DayContract, breakMinutes: number): number | null {
  if (!contract.expectedStart || !contract.expectedEnd) return null;
  const minutes = shiftMinutes(contract.expectedStart, contract.expectedEnd, breakMinutes);
  return minutes > 0 ? minutes : null;
}

/**
 * What one worked day earns with pay counted by the day or the hour: the hours times the rate,
 * or the diária in proportion to the agreed times. A diária stays whole when the contract has
 * no times or the day has no check-out yet. Null for a salary, which doesn't change with days.
 */
export function workedDayCents(
  contract: DayContract,
  day: { minutes: number; breakMinutes: number },
): number | null {
  switch (contract.payType) {
    case "hourly":
      return Math.round((day.minutes * contract.rateCents) / 60);
    case "daily": {
      const expected = expectedDayMinutes(contract, day.breakMinutes);
      return expected && day.minutes > 0 && day.minutes !== expected
        ? Math.round((day.minutes * contract.rateCents) / expected)
        : contract.rateCents;
    }
    case "biweekly":
    case "monthly":
      return null;
  }
}

export interface SummaryInput {
  contract: Pick<
    Contract,
    | "payType"
    | "rateCents"
    | "schedule"
    | "deductAbsences"
    | "startedOn"
    | "endedOn"
    | "workerId"
    | "expectedStart"
    | "expectedEnd"
  >;
  month: YearMonth;
  entries: Pick<WorkEntry, "date" | "status" | "minutes" | "breakMinutes" | "confirmedAt">[];
  /** Payments-list entries whose referenceMonth equals `month`, of every kind. */
  payments: Pick<Payment, "amountCents" | "kind" | "method">[];
  /** Local "today" of the household; days after it never count as unrecorded. */
  today: IsoDate;
}

export function computeMonthSummary(input: SummaryInput): MonthSummary {
  const { contract, month, entries, payments, today } = input;
  const byDate = new Map(entries.map((e) => [e.date, e]));

  let totalMinutes = 0;
  let daysWorked = 0;
  let absences = 0;
  let excused = 0;
  let daysOff = 0;
  let holidays = 0;
  let pendingConfirmation = 0;
  let diariasCents = 0;

  for (const e of entries) {
    if (!e.date.startsWith(month)) continue;
    // With no linked worker there is nobody on the other side to confirm.
    if (!e.confirmedAt && contract.workerId !== null) pendingConfirmation++;
    switch (e.status) {
      case "worked":
        daysWorked++;
        totalMinutes += e.minutes;
        if (contract.payType === "daily") diariasCents += workedDayCents(contract, e)!;
        break;
      case "absent":
        absences++;
        break;
      case "excused":
        excused++;
        break;
      case "day_off":
        daysOff++;
        break;
      case "holiday":
        holidays++;
        break;
    }
  }

  const period = { startedOn: contract.startedOn, endedOn: contract.endedOn };
  const expectedDates = expectedDatesInMonth(contract.schedule, month, period);
  const expectedDays = expectedCountInMonth(contract.schedule, month, period);
  const unrecordedDates = expectedDates.filter((date) => date <= today && !byDate.has(date));

  let grossCents: number;
  switch (contract.payType) {
    case "hourly":
      grossCents = Math.round((totalMinutes * contract.rateCents) / 60);
      break;
    case "daily":
      grossCents = diariasCents;
      break;
    case "biweekly":
    case "monthly":
      grossCents = salaryPerMonthCents(contract.payType, contract.rateCents)!;
      break;
  }

  const absenceDeductionCents =
    isSalaried(contract.payType) && contract.deductAbsences
      ? Math.min(grossCents, absences * Math.round(grossCents / 30))
      : 0;
  const earnedCents = grossCents - absenceDeductionCents;

  const adjustmentsCents = payments.reduce(
    (sum, p) => sum + PAYMENT_KIND_DUE_SIGN[p.kind] * p.amountCents,
    0,
  );
  const dueCents = earnedCents + adjustmentsCents;
  const paidCents = payments.reduce((sum, p) => sum + (countsAsPaid(p) ? p.amountCents : 0), 0);

  return {
    month,
    payType: contract.payType,
    rateCents: contract.rateCents,
    totalMinutes,
    daysWorked,
    absences,
    excused,
    daysOff,
    holidays,
    expectedDays,
    expectedDates,
    unrecordedDates,
    pendingConfirmation,
    grossCents,
    absenceDeductionCents,
    adjustmentsCents,
    dueCents,
    paidCents,
    balanceCents: dueCents - paidCents,
    avgPerDayCents: daysWorked > 0 ? Math.round(earnedCents / daysWorked) : 0,
    effectiveHourlyCents: totalMinutes > 0 ? Math.round((earnedCents * 60) / totalMinutes) : 0,
  };
}
