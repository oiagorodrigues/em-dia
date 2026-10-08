import {
  salaryPerMonthCents,
  type ClockTime,
  type IsoDate,
  type PayType,
  type YearMonth,
} from "./domain.ts";
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
    case "biweekly":
    case "monthly":
      cents = overlapsMonth(month, period)
        ? salaryPerMonthCents(input.payType, input.rateCents)
        : 0;
      break;
    case "daily":
    case "shift":
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

export interface DerivedRates {
  monthCents: number | null;
  fortnightCents: number | null;
  /** Per expected day of work, so a salary is split over the days the schedule asks for. */
  dayCents: number | null;
  /** Over the expected hours of a day (expectedStart to expectedEnd). */
  hourCents: number | null;
}

/**
 * The contract's rate restated per month, quinzena, day and hour. Turning a day into a
 * month uses the average expected days over `months` months from `from`; a day into hours
 * uses the expected times. A unit that needs what isn't known (no times, no fixed days) is null.
 */
export function derivedRates(input: EstimateInput, from: YearMonth, months = 12): DerivedRates {
  const period = { startedOn: input.startedOn, endedOn: input.endedOn ?? null };
  let days = 0;
  if (input.schedule.kind !== "on_demand")
    for (let i = 0; i < months; i++)
      days += expectedCountInMonth(input.schedule, shiftMonth(from, i), period);
  const daysPerMonth = days > 0 ? days / months : null;
  const minutesPerDay =
    input.expectedStart && input.expectedEnd
      ? shiftMinutes(input.expectedStart, input.expectedEnd)
      : null;
  const hoursPerDay = minutesPerDay ? minutesPerDay / 60 : null;

  let month: number | null;
  let day: number | null;
  let hour: number | null;
  switch (input.payType) {
    case "biweekly":
    case "monthly":
      month = salaryPerMonthCents(input.payType, input.rateCents);
      day = month !== null && daysPerMonth ? month / daysPerMonth : null;
      hour = day !== null && hoursPerDay ? day / hoursPerDay : null;
      break;
    case "daily":
      day = input.rateCents;
      month = daysPerMonth ? day * daysPerMonth : null;
      hour = hoursPerDay ? day / hoursPerDay : null;
      break;
    case "shift":
      // A plantão is 24h whatever the agreed times say; each expected day starts one.
      day = input.rateCents;
      month = daysPerMonth ? day * daysPerMonth : null;
      hour = day / 24;
      break;
    case "hourly":
      hour = input.rateCents;
      day = hoursPerDay ? hour * hoursPerDay : null;
      month = day !== null && daysPerMonth ? day * daysPerMonth : null;
      break;
  }
  const cents = (n: number | null) => (n === null ? null : Math.round(n));
  return {
    monthCents: cents(month),
    fortnightCents: cents(month === null ? null : month / 2),
    dayCents: cents(day),
    hourCents: cents(hour),
  };
}
