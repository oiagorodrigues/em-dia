import type { IsoDate, YearMonth } from "./domain.ts";
import { datesOfMonth, daysInMonth, parseYearMonth, weekdayOf } from "./time.ts";

/**
 * weekly: fixed weekdays, every N weeks (2x/semana, quinzenal, todos os dias)
 * month_days: fixed days of the month (todo dia 5)
 * per_month: N visits per month on no fixed date
 * on_demand: no expectation; days are recorded as they happen
 */
export const SCHEDULE_KINDS = ["weekly", "month_days", "per_month", "on_demand"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  weekly: "Dias da semana",
  month_days: "Datas do mês",
  per_month: "Vezes por mês",
  on_demand: "Quando precisar",
};

export interface Schedule {
  kind: ScheduleKind;
  /** weekly: 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** weekly: 1 = every week, 2 = every other week (quinzenal) … */
  everyWeeks: number;
  /** month_days: 1–31; days past the end of a short month fall on its last day. */
  monthDays: number[];
  /** per_month: expected visits per month. */
  visitsPerMonth: number | null;
}

export const EMPTY_SCHEDULE: Schedule = {
  kind: "on_demand",
  weekdays: [],
  everyWeeks: 1,
  monthDays: [],
  visitsPerMonth: null,
};

interface Period {
  startedOn: IsoDate;
  endedOn: IsoDate | null;
}

const DAY_MS = 86_400_000;

function epochDay(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/** Weeks start on Monday, as on Brazilian calendars. */
function mondayEpochDay(date: IsoDate): number {
  return epochDay(date) - ((weekdayOf(date) + 6) % 7);
}

function inPeriod(date: IsoDate, { startedOn, endedOn }: Period): boolean {
  return date >= startedOn && (endedOn === null || date <= endedOn);
}

export function overlapsMonth(month: YearMonth, { startedOn, endedOn }: Period): boolean {
  const days = datesOfMonth(month);
  return startedOn <= days[days.length - 1]! && (endedOn === null || endedOn >= days[0]!);
}

/** Dates the worker is expected in `month`. Empty for per_month and on_demand. */
export function expectedDatesInMonth(
  schedule: Schedule,
  month: YearMonth,
  period: Period,
): IsoDate[] {
  switch (schedule.kind) {
    case "weekly": {
      const weekdays = new Set(schedule.weekdays);
      const every = Math.max(1, schedule.everyWeeks);
      const anchor = mondayEpochDay(period.startedOn);
      return datesOfMonth(month).filter((date) => {
        if (!weekdays.has(weekdayOf(date)) || !inPeriod(date, period)) return false;
        const week = Math.floor((mondayEpochDay(date) - anchor) / 7);
        return week % every === 0;
      });
    }
    case "month_days": {
      const { year, month: m } = parseYearMonth(month);
      const last = daysInMonth(year, m);
      const days = new Set(schedule.monthDays.map((d) => Math.min(d, last)));
      return [...days]
        .sort((a, b) => a - b)
        .map((d) => `${month}-${String(d).padStart(2, "0")}`)
        .filter((date) => inPeriod(date, period));
    }
    case "per_month":
    case "on_demand":
      return [];
  }
}

/** How many days the worker is expected in `month`. */
export function expectedCountInMonth(schedule: Schedule, month: YearMonth, period: Period): number {
  if (schedule.kind === "per_month") {
    return overlapsMonth(month, period) ? (schedule.visitsPerMonth ?? 0) : 0;
  }
  return expectedDatesInMonth(schedule, month, period).length;
}

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Short pt-BR description, e.g. "seg, qua e sex", "quinzenal: sex", "todo dia 5", "2x por mês". */
export function describeSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case "weekly": {
      // Monday first, Sunday last.
      const ordered = [...new Set(schedule.weekdays)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      const days =
        ordered.length === 7
          ? "todos os dias"
          : ordered.length === 6 && !ordered.includes(0)
            ? "seg a sáb"
            : ordered.length === 5 && !ordered.includes(0) && !ordered.includes(6)
              ? "seg a sex"
              : joinPt(ordered.map((d) => WEEKDAY_SHORT[d]!));
      if (schedule.everyWeeks === 2) return `quinzenal: ${days}`;
      if (schedule.everyWeeks > 2) return `a cada ${schedule.everyWeeks} semanas: ${days}`;
      return days;
    }
    case "month_days": {
      const days = [...new Set(schedule.monthDays)].sort((a, b) => a - b).map(String);
      return days.length === 1 ? `todo dia ${days[0]}` : `dias ${joinPt(days)} de cada mês`;
    }
    case "per_month": {
      const n = schedule.visitsPerMonth ?? 0;
      return n === 1 ? "1x por mês" : `${n}x por mês`;
    }
    case "on_demand":
      return "quando precisar";
  }
}
