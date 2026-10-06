import type { ClockTime, IsoDate, YearMonth } from "./domain.ts";

export const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return d <= daysInMonth(y, m);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const [year, month] = ym.split("-").map(Number) as [number, number];
  return { year, month };
}

export function toYearMonth(date: IsoDate): YearMonth {
  return date.slice(0, 7);
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const { year, month } = parseYearMonth(ym);
  const idx = year * 12 + (month - 1) + delta;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function datesOfMonth(ym: YearMonth): IsoDate[] {
  const { year, month } = parseYearMonth(ym);
  const n = daysInMonth(year, month);
  const out: IsoDate[] = [];
  for (let d = 1; d <= n; d++) out.push(`${ym}-${String(d).padStart(2, "0")}`);
  return out;
}

/** 0 = Sunday … 6 = Saturday, independent of host timezone. */
export function weekdayOf(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function clockToMinutes(t: ClockTime): number {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function minutesToClock(total: number): ClockTime {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Worked minutes for a shift. A checkOut earlier than checkIn is an overnight shift. */
export function shiftMinutes(checkIn: ClockTime, checkOut: ClockTime, breakMinutes = 0): number {
  let span = clockToMinutes(checkOut) - clockToMinutes(checkIn);
  if (span < 0) span += 24 * 60;
  return Math.max(0, span - breakMinutes);
}

/** "86h40" style; "0h" for zero. */
export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Current date and clock in a given IANA timezone. */
export function nowInZone(
  timeZone: string,
  now: Date = new Date(),
): { date: IsoDate; time: ClockTime } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

export function formatYearMonth(ym: YearMonth): string {
  const { year, month } = parseYearMonth(ym);
  return `${monthName(month)} ${year}`;
}
