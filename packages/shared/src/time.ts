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

/** The date `days` after (or before, when negative) `date`. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = (s: IsoDate) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/**
 * A day's work that may end on a later date (a plantão). Without `checkOutDate`, a checkOut
 * earlier than checkIn is the next morning, as in `shiftMinutes`.
 */
export interface Stay {
  date: IsoDate;
  checkIn: ClockTime;
  checkOut: ClockTime;
  checkOutDate: IsoDate | null;
  breakMinutes: number;
}

/** Clock minutes from check-in to check-out, before the break. */
function staySpan(stay: Stay): number {
  if (!stay.checkOutDate) return shiftMinutes(stay.checkIn, stay.checkOut);
  const span =
    daysBetween(stay.date, stay.checkOutDate) * 24 * 60 +
    clockToMinutes(stay.checkOut) -
    clockToMinutes(stay.checkIn);
  return Math.max(0, span);
}

/** Worked minutes of a stay: the span less the break. */
export function stayMinutes(stay: Stay): number {
  return Math.max(0, staySpan(stay) - stay.breakMinutes);
}

/** Night work for the adicional noturno: 22:00 to 05:00 (CLT art. 73, LC 150 art. 14). */
export const NIGHT_START = 22 * 60;
export const NIGHT_END = 5 * 60;

/**
 * Minutes of a stay between 22:00 and 05:00. The break has no clock time, so it isn't taken
 * off; the result is capped at the worked minutes so a long break can't leave more night than work.
 */
export function nightMinutes(stay: Stay): number {
  const start = clockToMinutes(stay.checkIn);
  const end = start + staySpan(stay);
  let night = 0;
  // The night that ends on day k runs from 22:00 of day k-1 to 05:00 of day k.
  for (let k = 0; k * 24 * 60 - (24 * 60 - NIGHT_START) < end; k++) {
    const from = k * 24 * 60 - (24 * 60 - NIGHT_START);
    const to = k * 24 * 60 + NIGHT_END;
    night += Math.max(0, Math.min(end, to) - Math.max(start, from));
  }
  return Math.min(night, stayMinutes(stay));
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
