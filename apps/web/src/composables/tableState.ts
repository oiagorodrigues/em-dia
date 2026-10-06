import { computed, onScopeDispose, reactive, watch } from "vue";
import { useRoute, useRouter, type LocationQuery } from "vue-router";
import { parseSort, serializeSort, type SortState, type TableState } from "@/lib/table.ts";

export interface TableStateOptions {
  defaultSort?: SortState | null;
  /** Filter names; each lives in the query under its own name. */
  filters?: readonly string[];
  /** Query-key prefix when a page has more than one table, e.g. "pg_". */
  prefix?: string;
}

/**
 * Table search/sort/filters mirrored in the URL (`?q=`, `?ordem=-horas`, `?funcao=…`), so a
 * reload or a shared link shows the same rows. The default sort stays out of the URL.
 */
export function useTableState(options: TableStateOptions = {}) {
  const route = useRoute();
  const router = useRouter();
  const prefix = options.prefix ?? "";
  const filterNames = options.filters ?? [];
  const defaultSort = options.defaultSort ?? null;
  const k = (name: string) => `${prefix}${name}`;

  function fromQuery(query: LocationQuery): TableState {
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      q: str(query[k("q")]),
      sort: parseSort(query[k("ordem")]) ?? defaultSort,
      filters: Object.fromEntries(filterNames.map((f) => [f, str(query[k(f)])])),
    };
  }

  function toQuery(state: TableState): Record<string, string | undefined> {
    const sort = serializeSort(state.sort);
    return {
      [k("q")]: state.q.trim() || undefined,
      [k("ordem")]: sort && sort !== serializeSort(defaultSort) ? sort : undefined,
      ...Object.fromEntries(filterNames.map((f) => [k(f), state.filters[f] || undefined])),
    };
  }

  const state = reactive<TableState>(fromQuery(route.query));

  let timer: ReturnType<typeof setTimeout> | undefined;
  function write(): void {
    const next: LocationQuery = { ...route.query };
    for (const [key, value] of Object.entries(toQuery(state))) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    if (JSON.stringify(next) === JSON.stringify(route.query)) return;
    void router.replace({ query: next });
  }

  // Typing in the search box shouldn't push a history entry per keystroke.
  watch(
    () => state.q,
    () => {
      clearTimeout(timer);
      timer = setTimeout(write, 250);
    },
  );
  watch(() => [state.sort, { ...state.filters }], write, { deep: true });

  // Back/forward or a link changes the query from outside: follow it.
  watch(
    () => route.query,
    (query) => {
      const next = fromQuery(query);
      if (next.q !== state.q && next.q !== state.q.trim()) state.q = next.q;
      if (serializeSort(next.sort) !== serializeSort(state.sort)) state.sort = next.sort;
      for (const f of filterNames)
        if (next.filters[f] !== state.filters[f]) state.filters[f] = next.filters[f]!;
    },
  );

  onScopeDispose(() => clearTimeout(timer));

  const active = computed(() => !!state.q.trim() || filterNames.some((f) => !!state.filters[f]));

  function clear(): void {
    state.q = "";
    for (const f of filterNames) state.filters[f] = "";
  }

  return { state, active, clear };
}
