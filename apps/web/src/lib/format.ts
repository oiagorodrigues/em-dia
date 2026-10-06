import {
  formatDuration,
  monthName,
  parseYearMonth,
  type EntryStatus,
  type IsoDate,
  type YearMonth,
} from "@ponto/shared";

export const WEEKDAY_LETTER = ["D", "S", "T", "Q", "Q", "S", "S"] as const;
export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
export const WEEKDAY_LONG = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

/** Short uppercase text inked on the time card for non-worked days. */
export const STATUS_STAMP: Record<Exclude<EntryStatus, "worked">, string> = {
  absent: "Falta",
  excused: "Justif.",
  day_off: "Folga",
  holiday: "Feriado",
};

function parts(date: IsoDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/** "7 de outubro" */
export function formatDayMonth(date: IsoDate): string {
  const { m, d } = parts(date);
  return `${d} de ${monthName(m)}`;
}

/** "07/10/2026" */
export function formatDateShort(date: IsoDate): string {
  const { y, m, d } = parts(date);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** "out 2026" */
export function formatMonthShort(ym: YearMonth): string {
  const { year, month } = parseYearMonth(ym);
  return `${monthName(month).slice(0, 3)} ${year}`;
}

export function formatBreak(minutes: number): string {
  return minutes > 0 ? formatDuration(minutes) : "—";
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "há 5 min", "ontem às 14:02", "3 de out., 09:10" for an ISO timestamp. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = Math.round((now.getTime() - then.getTime()) / 1000);
  if (Number.isNaN(diff)) return "";
  if (diff < 45) return "agora";
  if (diff < 3600) return `há ${Math.max(1, Math.round(diff / 60))} min`;
  if (diff < 6 * 3600) return `há ${Math.round(diff / 3600)} h`;
  return dateTime.format(then).replace(" de ", " ").replace(".", "");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
