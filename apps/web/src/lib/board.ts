import {
  addDays,
  datesOfMonth,
  formatCents,
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
import { attendanceText } from "./schedule.ts";

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

/** The days after the first of each stay that ends on a later date, with the stay. */
export function coveredDays(entries: readonly WorkEntry[]): Map<IsoDate, WorkEntry> {
  const covers = new Map<IsoDate, WorkEntry>();
  for (const e of entries) {
    if (!e.checkOutDate) continue;
    for (let d = addDays(e.date, 1); d <= e.checkOutDate; d = addDays(d, 1)) covers.set(d, e);
  }
  return covers;
}

/** Days that open the day editor from the board; outside the contract there is nothing to record. */
export function dayOpens(cell: Pick<BoardCell, "kind">): boolean {
  return cell.kind !== "outside";
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
  const covers = coveredDays(entries);
  return datesOfMonth(month).map((date) => {
    const entry = byDate.get(date) ?? null;
    const weekday = weekdayOf(date);
    const cover = entry ? undefined : covers.get(date);
    const kind = cover ? "worked" : cellKind(date, entry, summary, period);
    const day = `${WEEKDAY_SHORT[weekday]}, ${formatDayMonth(date)}`;
    return {
      date,
      day: Number(date.slice(8)),
      weekday,
      kind,
      entry,
      isToday: date === today,
      isWeekend: weekday === 0 || weekday === 6,
      tip: cover ? "em plantão" : cellTip(kind, entry),
      label: cover
        ? `${day}: em plantão desde ${WEEKDAY_SHORT[weekdayOf(cover.date)]}, ${formatDayMonth(cover.date)}`
        : cellLabel(date, kind, entry),
    };
  });
}

/**
 * The 7 days (Monday first) for the phone strip: this week, the last week of a past month,
 * or the first full week of a future month (so it isn't mostly the month before).
 */
export function stripDates(month: YearMonth, today: IsoDate): IsoDate[] {
  const days = datesOfMonth(month);
  let focus: IsoDate;
  if (today > days[days.length - 1]!) focus = days[days.length - 1]!;
  else if (today < days[0]!) focus = days.find((d) => weekdayOf(d) === 1)!;
  else focus = today;
  const [y, m, d] = focus.split("-").map(Number) as [number, number, number];
  const monday = Date.UTC(y, m - 1, d) - ((weekdayOf(focus) + 6) % 7) * 86_400_000;
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday + i * 86_400_000).toISOString().slice(0, 10),
  );
}

export const BOARD_STATUS_FILTERS = [
  { value: "", label: "Ativos" },
  { value: "encerrados", label: "Encerrados" },
  { value: "todos", label: "Todos" },
] as const;

/** "" (default) = ativos. Removed contracts never reach the board. */
export function matchesBoardStatus(contract: Pick<Contract, "status">, filter: string): boolean {
  if (filter === "todos") return true;
  if (filter === "encerrados") return contract.status === "ended";
  return contract.status === "active";
}

export interface RowTotals {
  /** Sort keys; null when unknown (a projection without times or without a price). */
  minutes: number | null;
  dueCents: number | null;
  hours: string;
  days: string;
  due: string;
}

/**
 * Row totals of the board. A future month has nothing recorded yet, so it shows the
 * projection from `DashboardItem.estimate` instead (styled apart, never mixed with actuals).
 */
export function rowTotals(item: DashboardItem, projected: boolean): RowTotals {
  const { summary, contract } = item;
  if (!projected) {
    return {
      minutes: summary.totalMinutes,
      dueCents: summary.balanceCents,
      hours: formatDuration(summary.totalMinutes),
      days: attendanceText(summary, contract.schedule.kind),
      due: formatCents(Math.max(0, summary.balanceCents)),
    };
  }
  const { estimate } = item;
  const minutes = estimate.minutesPerDay === null ? null : estimate.days * estimate.minutesPerDay;
  const unit = contract.schedule.kind === "per_month" ? ["visita", "visitas"] : ["dia", "dias"];
  return {
    minutes,
    dueCents: estimate.cents,
    hours: minutes === null ? "—" : formatDuration(minutes),
    days:
      contract.schedule.kind === "on_demand"
        ? "—"
        : `${estimate.days} ${estimate.days === 1 ? unit[0] : unit[1]}`,
    due: estimate.cents === null ? "—" : formatCents(estimate.cents),
  };
}
