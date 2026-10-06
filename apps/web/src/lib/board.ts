import {
  datesOfMonth,
  ENTRY_STATUS_LABEL,
  formatDuration,
  weekdayOf,
  type Contract,
  type DashboardItem,
  type IsoDate,
  type MonthSummary,
  type WorkEntry,
  type YearMonth,
} from "@emdia/shared";
import { formatDayMonth, WEEKDAY_SHORT } from "./format.ts";

/**
 * worked: mint · absent: coral · soft: excused/day off/holiday (butter) ·
 * missing: expected, passed, nothing recorded (dashed) · planned: expected later (faint dot) ·
 * none: not expected, nothing recorded · outside: before the start or after the end.
 */
export type BoardCellKind =
  | "worked"
  | "absent"
  | "soft"
  | "missing"
  | "planned"
  | "none"
  | "outside";

export interface BoardCell {
  date: IsoDate;
  day: number;
  weekday: number;
  kind: BoardCellKind;
  entry: WorkEntry | null;
  isToday: boolean;
  isWeekend: boolean;
  /** Short text for the tooltip, e.g. "8h", "falta", "sem registro". */
  tip: string;
  /** Full status for screen readers: "qua, 7 de outubro: trabalhou 8h". */
  label: string;
}

export interface BoardRow {
  item: DashboardItem;
  cells: BoardCell[];
}

type Period = Pick<Contract, "startedOn" | "endedOn">;
type Expectations = Pick<MonthSummary, "expectedDates" | "unrecordedDates">;

export function cellKind(
  date: IsoDate,
  entry: WorkEntry | null,
  summary: Expectations,
  period: Period,
): BoardCellKind {
  if (entry) {
    if (entry.status === "worked") return "worked";
    if (entry.status === "absent") return "absent";
    return "soft";
  }
  if (date < period.startedOn || (period.endedOn !== null && date > period.endedOn))
    return "outside";
  // The summary's own lists, so the board and the "dias sem registro" counts never disagree.
  if (summary.unrecordedDates.includes(date)) return "missing";
  if (summary.expectedDates.includes(date)) return "planned";
  return "none";
}

const KIND_TEXT: Record<Exclude<BoardCellKind, "worked" | "absent" | "soft">, string> = {
  missing: "previsto, sem registro",
  planned: "previsto",
  none: "sem registro",
  outside: "fora do período",
};

export function cellTip(kind: BoardCellKind, entry: WorkEntry | null): string {
  if (entry && kind === "worked")
    return entry.minutes > 0
      ? formatDuration(entry.minutes)
      : entry.checkIn && !entry.checkOut
        ? `desde ${entry.checkIn}`
        : "trabalhou";
  if (entry) return ENTRY_STATUS_LABEL[entry.status].toLowerCase();
  return KIND_TEXT[kind as keyof typeof KIND_TEXT];
}

export function cellLabel(date: IsoDate, kind: BoardCellKind, entry: WorkEntry | null): string {
  const day = `${WEEKDAY_SHORT[weekdayOf(date)]}, ${formatDayMonth(date)}`;
  if (entry && kind === "worked") return `${day}: trabalhou ${cellTip(kind, entry)}`;
  return `${day}: ${cellTip(kind, entry)}`;
}

export function boardCells(
  month: YearMonth,
  entries: readonly WorkEntry[],
  summary: Expectations,
  period: Period,
  today: IsoDate,
): BoardCell[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  return datesOfMonth(month).map((date) => {
    const entry = byDate.get(date) ?? null;
    const weekday = weekdayOf(date);
    const kind = cellKind(date, entry, summary, period);
    return {
      date,
      day: Number(date.slice(8)),
      weekday,
      kind,
      entry,
      isToday: date === today,
      isWeekend: weekday === 0 || weekday === 6,
      tip: cellTip(kind, entry),
      label: cellLabel(date, kind, entry),
    };
  });
}

/** The 7 days (Monday first) to show on the phone strip: this week, or the month's edge week. */
export function stripDates(month: YearMonth, today: IsoDate): IsoDate[] {
  const days = datesOfMonth(month);
  const focus =
    today < days[0]! ? days[0]! : today > days[days.length - 1]! ? days[days.length - 1]! : today;
  const [y, m, d] = focus.split("-").map(Number) as [number, number, number];
  const monday = Date.UTC(y, m - 1, d) - ((weekdayOf(focus) + 6) % 7) * 86_400_000;
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday + i * 86_400_000).toISOString().slice(0, 10),
  );
}

export const BOARD_STATUS_FILTERS = [
  { value: "", label: "ativos" },
  { value: "encerrados", label: "encerrados" },
  { value: "todos", label: "todos" },
] as const;

/** "" (default) = ativos. Removed contracts never reach the board. */
export function matchesBoardStatus(contract: Pick<Contract, "status">, filter: string): boolean {
  if (filter === "todos") return true;
  if (filter === "encerrados") return contract.status === "ended";
  return contract.status === "active";
}
