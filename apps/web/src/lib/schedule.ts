import {
  describeSchedule,
  expectedCountInMonth,
  monthName,
  parseYearMonth,
  type MonthSummary,
  type Schedule,
  type ScheduleKind,
  type YearMonth,
} from "@emdia/shared";

export const DEFAULT_SCHEDULE: Schedule = {
  kind: "weekly",
  weekdays: [1, 3, 5],
  everyWeeks: 1,
  monthDays: [],
  visitsPerMonth: null,
};

export const WEEKDAY_PRESETS = [
  { label: "seg a sex", weekdays: [1, 2, 3, 4, 5] },
  { label: "seg a sáb", weekdays: [1, 2, 3, 4, 5, 6] },
  { label: "todos os dias", weekdays: [0, 1, 2, 3, 4, 5, 6] },
] as const;

export const EVERY_WEEKS_OPTIONS = [
  { value: 1, label: "toda semana" },
  { value: 2, label: "a cada 2" },
  { value: 3, label: "a cada 3" },
  { value: 4, label: "a cada 4" },
] as const;

export function sameDays(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((d) => set.has(d));
}

export function toggleDay(days: readonly number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

/** Switching kind keeps what was typed in the other kinds, and seeds sensible values for the new one. */
export function withKind(schedule: Schedule, kind: ScheduleKind): Schedule {
  const next: Schedule = { ...schedule, kind };
  if (kind === "weekly" && next.weekdays.length === 0)
    next.weekdays = [...DEFAULT_SCHEDULE.weekdays];
  if (kind === "month_days" && next.monthDays.length === 0) next.monthDays = [5];
  if (kind === "per_month" && next.visitsPerMonth === null) next.visitsPerMonth = 2;
  return next;
}

/** Live line under the schedule form, e.g. "quinzenal: sex · ~2 dias em outubro". */
export function scheduleSummaryLine(
  schedule: Schedule,
  month: YearMonth,
  startedOn: string,
): string {
  const described = describeSchedule(schedule);
  if (schedule.kind === "on_demand") return `${described} · sem dias previstos`;
  const isEmpty =
    (schedule.kind === "weekly" && schedule.weekdays.length === 0) ||
    (schedule.kind === "month_days" && schedule.monthDays.length === 0) ||
    (schedule.kind === "per_month" && !schedule.visitsPerMonth);
  if (isEmpty) return "escolha os dias";
  const n = expectedCountInMonth(schedule, month, { startedOn, endedOn: null });
  const unit =
    schedule.kind === "per_month" ? (n === 1 ? "visita" : "visitas") : n === 1 ? "dia" : "dias";
  const approx = schedule.kind === "weekly" && schedule.everyWeeks > 1 ? "~" : "";
  return `${described} · ${approx}${n} ${unit} em ${monthName(parseYearMonth(month).month)}`;
}

/** "2 de 9", "visitas 1 de 2", or just "3" when nothing is expected. */
export function attendanceText(
  summary: Pick<MonthSummary, "daysWorked" | "expectedDays">,
  kind: ScheduleKind,
): string {
  if (kind === "on_demand" || summary.expectedDays === 0) return String(summary.daysWorked);
  return `${summary.daysWorked} de ${summary.expectedDays}`;
}

export function attendanceLabel(kind: ScheduleKind): string {
  return kind === "per_month" ? "Visitas" : "Dias trabalhados";
}
