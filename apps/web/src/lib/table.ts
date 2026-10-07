import { foldText } from "./text.ts";

export type SortDir = "asc" | "desc";
export type CellValue = string | number | boolean | null | undefined;

export interface Column<T> {
  key: string;
  label: string;
  /** Raw value: drives sorting, searching and the default cell text. */
  value?: (row: T) => CellValue;
  /** Display text when no `cell-<key>` slot is given; defaults to String(value). */
  format?: (row: T) => string;
  sortable?: boolean;
  /** First click sorts this way; "desc" suits money and hours (biggest first). */
  sortFirst?: SortDir;
  /** Included in the toolbar search (accent-insensitive). */
  searchable?: boolean;
  /** Extra text the search should match for this column (e.g. função shown under the name). */
  search?: (row: T) => string;
  align?: "left" | "right" | "center";
  /** Money, hours and dates: Martian Mono, tabular. */
  mono?: boolean;
  width?: string;
  /** Hide the column below this breakpoint in table mode. */
  hideBelow?: "lg" | "xl" | "2xl";
  /**
   * Free text that may be long (notes, descriptions): one line cut with an ellipsis at
   * `width` (default 16rem), the full text in a tooltip. Ignored when a `cell-<key>` slot is given.
   */
  truncate?: boolean;
  /**
   * Columns with a priority (or a `hideBelow`, which counts as 0) may drop out when the table
   * is wider than its box, lowest first, so the row actions never end up behind a horizontal
   * scroll. Columns without either always stay.
   */
  priority?: number;
  /** Visually hidden header (e.g. an avatar column); the label stays for screen readers. */
  srOnlyLabel?: boolean;
}

/**
 * Keys that may drop out to fit the table, in the order they go: lowest priority first, then
 * right to left. A `hideBelow` column is already marked optional, so it counts as priority 0.
 */
export function dropOrder<T>(columns: readonly Column<T>[]): string[] {
  return columns
    .map((c, index) => ({ c, index, p: c.priority ?? (c.hideBelow ? 0 : undefined) }))
    .filter((x): x is typeof x & { p: number } => x.p !== undefined)
    .sort((a, b) => a.p - b.p || b.index - a.index)
    .map(({ c }) => c.key);
}

/**
 * Colspans for a totals row with one cell under `key`: the cells before it, and the cells
 * after it plus the row-actions column. Takes the columns actually shown, since some drop out.
 */
export function spansAround<T>(shown: readonly Column<T>[], key: string): [number, number] {
  const at = shown.findIndex((c) => c.key === key);
  return [at, shown.length - at];
}

export interface SortState {
  key: string;
  dir: SortDir;
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export function searchRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  query: string,
): T[] {
  const q = foldText(query);
  if (!q) return [...rows];
  const searchable = columns.filter((c) => c.searchable && (c.value || c.search));
  const terms = q.split(/\s+/);
  return rows.filter((row) => {
    const haystack = foldText(
      searchable.map((c) => `${String(c.value?.(row) ?? "")} ${c.search?.(row) ?? ""}`).join(" "),
    );
    return terms.every((t) => haystack.includes(t));
  });
}

/** Stable sort; empty values always go last, whatever the direction. */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  sort: SortState | null,
): T[] {
  const out = [...rows];
  const column = sort ? columns.find((c) => c.key === sort.key && c.value) : undefined;
  if (!sort || !column) return out;
  const sign = sort.dir === "asc" ? 1 : -1;
  return out
    .map((row, index) => ({ row, index, v: column.value!(row) }))
    .sort((a, b) => {
      const aEmpty = a.v === null || a.v === undefined || a.v === "";
      const bEmpty = b.v === null || b.v === undefined || b.v === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
      let cmp: number;
      if (typeof a.v === "number" && typeof b.v === "number") cmp = a.v - b.v;
      else if (typeof a.v === "boolean" && typeof b.v === "boolean")
        cmp = Number(a.v) - Number(b.v);
      else cmp = collator.compare(String(a.v), String(b.v));
      return cmp === 0 ? a.index - b.index : cmp * sign;
    })
    .map((x) => x.row);
}

/** "nome" ⇄ { key: "nome", dir: "asc" }, "-horas" ⇄ { key: "horas", dir: "desc" } */
export function parseSort(raw: unknown): SortState | null {
  if (typeof raw !== "string" || !raw) return null;
  return raw.startsWith("-") ? { key: raw.slice(1), dir: "desc" } : { key: raw, dir: "asc" };
}

export function serializeSort(sort: SortState | null): string | undefined {
  if (!sort) return undefined;
  return sort.dir === "desc" ? `-${sort.key}` : sort.key;
}

/** Clicking a header: new column starts ascending (numbers read better high→low, so pass "desc"). */
export function nextSort(
  current: SortState | null,
  key: string,
  firstDir: SortDir = "asc",
): SortState {
  if (current?.key !== key) return { key, dir: firstDir };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

/** Search, sort and filters of one table; `useTableState` mirrors it in the URL query. */
export interface TableState {
  q: string;
  sort: SortState | null;
  /** Page-defined filters, e.g. { funcao: "diarista" }; "" means "todos". */
  filters: Record<string, string>;
}
