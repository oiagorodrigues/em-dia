import {
  ADJUSTMENT_SIGN,
  type Adjustment,
  type Contract,
  type IsoDate,
  type MonthSummary,
  type Payment,
  type WorkEntry,
  type YearMonth,
} from "./domain.ts";
import { datesOfMonth, weekdayOf } from "./time.ts";

export interface SummaryInput {
  contract: Pick<
    Contract,
    "payType" | "rateCents" | "scheduleDays" | "startedOn" | "endedOn" | "workerId"
  >;
  month: YearMonth;
  entries: Pick<WorkEntry, "date" | "status" | "minutes" | "confirmedAt">[];
  adjustments: Pick<Adjustment, "kind" | "amountCents">[];
  /** Payments whose referenceMonth equals `month`. */
  payments: Pick<Payment, "amountCents">[];
  /** Local "today" of the household; days after it never count as unrecorded. */
  today: IsoDate;
}

function inContract(date: IsoDate, startedOn: IsoDate, endedOn: IsoDate | null): boolean {
  return date >= startedOn && (endedOn === null || date <= endedOn);
}

export function computeMonthSummary(input: SummaryInput): MonthSummary {
  const { contract, month, entries, adjustments, payments, today } = input;
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const schedule = new Set(contract.scheduleDays);

  let totalMinutes = 0;
  let daysWorked = 0;
  let absences = 0;
  let excused = 0;
  let daysOff = 0;
  let holidays = 0;
  let pendingConfirmation = 0;

  for (const e of entries) {
    if (!e.date.startsWith(month)) continue;
    // With no linked worker there is nobody on the other side to confirm.
    if (!e.confirmedAt && contract.workerId !== null) pendingConfirmation++;
    switch (e.status) {
      case "worked":
        daysWorked++;
        totalMinutes += e.minutes;
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

  let expectedDays = 0;
  const unrecordedDates: IsoDate[] = [];
  for (const date of datesOfMonth(month)) {
    if (!schedule.has(weekdayOf(date))) continue;
    if (!inContract(date, contract.startedOn, contract.endedOn)) continue;
    expectedDays++;
    if (date <= today && !byDate.has(date)) unrecordedDates.push(date);
  }

  let grossCents: number;
  switch (contract.payType) {
    case "hourly":
      grossCents = Math.round((totalMinutes * contract.rateCents) / 60);
      break;
    case "daily":
      grossCents = daysWorked * contract.rateCents;
      break;
    case "monthly":
      grossCents = contract.rateCents;
      break;
  }

  const adjustmentsCents = adjustments.reduce(
    (sum, a) => sum + ADJUSTMENT_SIGN[a.kind] * a.amountCents,
    0,
  );
  const dueCents = grossCents + adjustmentsCents;
  const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

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
    unrecordedDates,
    pendingConfirmation,
    grossCents,
    adjustmentsCents,
    dueCents,
    paidCents,
    balanceCents: dueCents - paidCents,
    avgPerDayCents: daysWorked > 0 ? Math.round(grossCents / daysWorked) : 0,
    effectiveHourlyCents: totalMinutes > 0 ? Math.round((grossCents * 60) / totalMinutes) : 0,
  };
}
