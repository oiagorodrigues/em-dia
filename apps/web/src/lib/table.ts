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
  /** Visually hidden header (e.g. an avatar column); the label stays for screen readers. */
  srOnlyLabel?: boolean;
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
