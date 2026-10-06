import type { ClockTime, IsoDate, PayType, YearMonth } from "./domain.ts";
import { expectedCountInMonth, overlapsMonth, type Schedule } from "./schedule.ts";
import { shiftMinutes, shiftMonth } from "./time.ts";

export interface EstimateInput {
  payType: PayType;
  rateCents: number;
  schedule: Schedule;
  expectedStart: ClockTime | null;
  expectedEnd: ClockTime | null;
  startedOn: IsoDate;
  endedOn?: IsoDate | null;
}

export interface MonthEstimate {
  month: YearMonth;
  /** Expected days (visits for per_month). */
  days: number;
  /** Expected minutes per day from expectedStart/End; null when the times are not set. */
  minutesPerDay: number | null;
  /** null when it can't be estimated: on_demand, or hourly pay without expected times. */
  cents: number | null;
}

/** What the contract is expected to cost in `month` if the worker comes on every expected day. */
export function estimateMonthCost(input: EstimateInput, month: YearMonth): MonthEstimate {
  const period = { startedOn: input.startedOn, endedOn: input.endedOn ?? null };
  const days = expectedCountInMonth(input.schedule, month, period);
  const minutesPerDay =
    input.expectedStart && input.expectedEnd
      ? shiftMinutes(input.expectedStart, input.expectedEnd)
      : null;

  let cents: number | null;
  switch (input.payType) {
    case "monthly":
      cents = overlapsMonth(month, period) ? input.rateCents : 0;
      break;
    case "daily":
      cents = input.schedule.kind === "on_demand" ? null : days * input.rateCents;
      break;
    case "hourly":
      cents =
        input.schedule.kind === "on_demand" || minutesPerDay === null
          ? null
          : Math.round((days * minutesPerDay * input.rateCents) / 60);
      break;
  }
  return { month, days, minutesPerDay, cents };
}

/**
 * Average monthly cost over `months` months starting at `from`, so a quinzenal or
 * weekday schedule isn't judged by one unusually long or short month.
 */
export function estimateAverageMonthlyCost(
  input: EstimateInput,
  from: YearMonth,
  months = 12,
): number | null {
  let total = 0;
  for (let i = 0; i < months; i++) {
    const { cents } = estimateMonthCost(input, shiftMonth(from, i));
    if (cents === null) return null;
    total += cents;
  }
  return Math.round(total / months);
}
