import { daysInMonth, isValidIsoDate, type IsoDate, type YearMonth } from "@emdia/shared";

/** "06102026" → "06/10/2026" as you type; digits only, slashes inserted. */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "06/10/2026" → "2026-10-06"; null when incomplete or not a real date. */
export function parseBrDate(text: string): IsoDate | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function isoToBr(iso: IsoDate | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export interface CalendarDay {
  date: IsoDate;
  day: number;
  inMonth: boolean;
}

/** Weeks of the month grid, Sunday first (as on Brazilian calendars), padded with the neighbours' days. */
export function monthGrid(month: YearMonth): CalendarDay[][] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = first.getUTCDay();
  const total = daysInMonth(y, m);
  const cells = Math.ceil((lead + total) / 7) * 7;
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells; i++) {
    const dt = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    const date = dt.toISOString().slice(0, 10);
    const day: CalendarDay = { date, day: dt.getUTCDate(), inMonth: i >= lead && i < lead + total };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1]!.push(day);
  }
  return weeks;
}

export function inRange(date: IsoDate, min?: IsoDate | null, max?: IsoDate | null): boolean {
  return (!min || date >= min) && (!max || date <= max);
}
