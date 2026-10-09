<script setup lang="ts" generic="T">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  useId,
  useSlots,
  useTemplateRef,
  watch,
} from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import {
  dropOrder,
  nextSort,
  searchRows,
  sortRows,
  type CellValue,
  type Column,
  type SortState,
  type TableState,
} from "@/lib/table.ts";
import { staggerDelay } from "@/lib/motion.ts";
import FilterDrawer from "./FilterDrawer.vue";
import Icon from "./Icon.vue";
import SkeletonTable from "./SkeletonTable.vue";
import Tooltip from "./Tooltip.vue";

const {
  rows,
  columns,
  rowKey,
  state: externalState,
  defaultSort = null,
  filter,
  rowLink,
  label,
  loading = false,
  searchable = true,
  searchPlaceholder = "Buscar",
  countLabel = (n: number) => (n === 1 ? "1 resultado" : `${n} resultados`),
  emptyTitle = "Nada por aqui ainda.",
  filtersActive = false,
  cardActions = "side",
  filterCount,
  selectable = false,
  selectLabel = () => "Selecionar linha",
  selectedLabel = (n: number) => (n === 1 ? "1 selecionado" : `${n} selecionados`),
} = defineProps<{
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  /** From `useTableState` (URL-synced). Without it the table keeps its own state. */
  state?: TableState;
  defaultSort?: SortState | null;
  /** Page-level filters (status tabs, selects); applied before search. */
  filter?: (row: T) => boolean;
  /** Makes the whole row a link (click or Enter). */
  rowLink?: (row: T) => RouteLocationRaw | null;
  /** Accessible name of the table, e.g. "Equipe". */
  label: string;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  countLabel?: (n: number) => string;
  emptyTitle?: string;
  /** The page's own filters are narrowing the rows (so "no rows" means "no results"). */
  filtersActive?: boolean;
  /** Where row actions sit on mobile cards: beside the content, or in a row below it (many actions). */
  cardActions?: "side" | "below";
  /** Active page filters, shown on the mobile "Filtros (n)" button. */
  filterCount?: number;
  /** A checkbox per row and, while something is selected, the bar of `bulk-actions`. */
  selectable?: boolean;
  /** Accessible name of a row's checkbox, e.g. "Selecionar pagamento de Maria, 05/10". */
  selectLabel?: (row: T) => string;
  selectedLabel?: (n: number) => string;
}>();

const emit = defineEmits<{ "row-click": [row: T]; "clear-filters": [] }>();

/** Keys (`rowKey`) of the selected rows; only rows still shown stay in it. */
const selected = defineModel<string[]>("selected", { default: () => [] });

defineSlots<{
  /** `cell-<key>`: custom cell content. */
  [name: `cell-${string}`]: (props: { row: T; value: CellValue }) => unknown;
  /** Mobile card for one row (below md). Defaults to label/value pairs. */
  card?: (props: { row: T }) => unknown;
  /** Quick actions at the end of the row (IconButtons, Menu). */
  "row-actions"?: (props: { row: T }) => unknown;
  /** Filter chips/selects next to the search box. */
  filters?: () => unknown;
  /** Primary action on the right of the toolbar. */
  actions?: () => unknown;
  /** Shown when there are no rows at all (before any filter). */
  empty?: () => unknown;
  /**
   * Totals row (table) / summary (cards). `columns` are the ones shown, for colspans; with
   * `selectable` the checkbox column comes first in it.
   */
  footer?: (props: { rows: readonly T[]; columns: readonly Column<T>[] }) => unknown;
  /** Buttons of the bulk action bar, for the selected rows that are shown. */
  "bulk-actions"?: (props: { rows: readonly T[]; clear: () => void }) => unknown;
}>();

const router = useRouter();
const id = useId();
const wide = useMediaQuery(MQ.md);
const lg = useMediaQuery(MQ.lg);
const xl = useMediaQuery(MQ.xl);
const xxl = useMediaQuery(MQ["2xl"]);

const internal = reactive<TableState>({ q: "", sort: defaultSort, filters: {} });
const state = computed(() => externalState ?? internal);

const breakpointColumns = computed(() =>
  columns.filter(
    (c) => !c.hideBelow || { lg: lg.value, xl: xl.value, "2xl": xxl.value }[c.hideBelow],
  ),
);

/** Keys dropped because the table was wider than its box (see `Column.priority`). */
const squeezed = ref<string[]>([]);
const visibleColumns = computed(() =>
  breakpointColumns.value.filter((c) => !squeezed.value.includes(c.key)),
);

const scroller = useTemplateRef<HTMLElement>("scroller");
let fitting = false;

/** Narrower cell padding, tried before any column is dropped. */
const tight = ref(false);

/** Shows every column, then tightens and drops the lowest priority ones until nothing overflows. */
async function fit(): Promise<void> {
  const el = scroller.value;
  if (!el || fitting) return;
  fitting = true;
  try {
    squeezed.value = [];
    tight.value = false;
    await nextTick();
    if (el.scrollWidth <= el.clientWidth) return;
    tight.value = true;
    await nextTick();
    for (const key of dropOrder(breakpointColumns.value)) {
      if (el.scrollWidth <= el.clientWidth) break;
      squeezed.value = [...squeezed.value, key];
      await nextTick();
    }
  } finally {
    fitting = false;
  }
}

let observer: ResizeObserver | undefined;
let lastWidth = -1;
watch(scroller, (el) => {
  observer?.disconnect();
  observer = undefined;
  if (!el) return;
  void fit();
  if (typeof ResizeObserver === "undefined") return;
  // Only width matters; dropping a column changes the height and must not refit.
  observer = new ResizeObserver(([entry]) => {
    const width = Math.round(entry?.contentRect.width ?? 0);
    if (width === lastWidth) return;
    lastWidth = width;
    void fit();
  });
  observer.observe(el);
});
watch(
  () => [rows.length, breakpointColumns.value.length],
  () => void fit(),
);
onBeforeUnmount(() => observer?.disconnect());

const filtered = computed(() => (filter ? rows.filter(filter) : [...rows]));
const searched = computed(() => searchRows(filtered.value, columns, state.value.q));
const shown = computed(() => sortRows(searched.value, columns, state.value.sort));
const narrowing = computed(() => filtersActive || !!state.value.q.trim());

const SELECT_COLUMN: Column<T> = { key: "_select", label: "Selecionar" };
const footerColumns = computed(() =>
  selectable ? [SELECT_COLUMN, ...visibleColumns.value] : visibleColumns.value,
);

const shownKeys = computed(() => shown.value.map((row) => rowKey(row)));
const selectedSet = computed(() => new Set(selected.value));
const selectedRows = computed(() =>
  shown.value.filter((row) => selectedSet.value.has(rowKey(row))),
);
const allSelected = computed(
  () => shown.value.length > 0 && selectedRows.value.length === shown.value.length,
);
const someSelected = computed(() => selectedRows.value.length > 0 && !allSelected.value);

// A search or filter that hides a row also unselects it, so an action never reaches rows
// the person can't see.
watch(shownKeys, (keys) => {
  const visible = new Set(keys);
  const kept = selected.value.filter((k) => visible.has(k));
  if (kept.length !== selected.value.length) selected.value = kept;
});

/** Last row toggled by hand; shift-click selects the run of rows between it and the next one. */
let anchor: string | null = null;

function toggleRow(row: T, event: MouseEvent): void {
  const key = rowKey(row);
  const on = (event.target as HTMLInputElement).checked;
  let keys = [key];
  if (event.shiftKey && anchor && anchor !== key) {
    const from = shownKeys.value.indexOf(anchor);
    const to = shownKeys.value.indexOf(key);
    if (from >= 0 && to >= 0)
      keys = shownKeys.value.slice(Math.min(from, to), Math.max(from, to) + 1);
  }
  anchor = key;
  const next = new Set(selected.value);
  for (const k of keys) {
    if (on) next.add(k);
    else next.delete(k);
  }
  selected.value = shownKeys.value.filter((k) => next.has(k));
}

function toggleAll(): void {
  selected.value = allSelected.value ? [] : [...shownKeys.value];
}

function clearSelection(): void {
  selected.value = [];
  anchor = null;
}

const slots = useSlots();
function hasSlot(name: string): boolean {
  return !!slots[name];
}

function valueOf(col: Column<T>, row: T): CellValue {
  return col.value ? col.value(row) : undefined;
}

function textOf(col: Column<T>, row: T): string {
  if (col.format) return col.format(row);
  const v = valueOf(col, row);
  return v === null || v === undefined ? "—" : String(v);
}

function sortBy(col: Column<T>): void {
  if (!col.sortable) return;
  state.value.sort = nextSort(state.value.sort, col.key, col.sortFirst);
}

function ariaSort(col: Column<T>): "ascending" | "descending" | "none" | undefined {
  if (!col.sortable) return undefined;
  if (state.value.sort?.key !== col.key) return "none";
  return state.value.sort.dir === "asc" ? "ascending" : "descending";
}

/** Clicks on buttons and links inside a row do their own thing. */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest("button, a, input, select, [role='menuitem'], .dt__check")
  );
}

function activate(row: T, event: Event): void {
  if (isInteractive(event.target) && event.target !== event.currentTarget) return;
  emit("row-click", row);
  const to = rowLink?.(row);
  if (to) void router.push(to);
}

function clearAll(): void {
  state.value.q = "";
  emit("clear-filters");
}
</script>

<template>
  <section class="dt" :aria-label="label">
    <div v-if="searchable || hasSlot('filters') || hasSlot('actions')" class="dt__toolbar">
      <label v-if="searchable" class="dt__search">
        <Icon name="search" :size="18" />
        <span class="visually-hidden">{{ searchPlaceholder }}</span>
        <input
          v-model="state.q"
          type="search"
          class="dt__search-input"
          :placeholder="searchPlaceholder"
          autocomplete="off"
          spellcheck="false"
          :aria-controls="id"
        />
      </label>
      <FilterDrawer
        v-if="hasSlot('filters')"
        class="dt__filters"
        :count="filterCount ?? (filtersActive ? 1 : 0)"
        :result-label="`Ver ${countLabel(shown.length)}`"
        @clear="clearAll"
        ><slot name="filters"
      /></FilterDrawer>
      <p class="dt__count" aria-live="polite">
        {{ loading ? "carregando…" : countLabel(shown.length) }}
      </p>
      <div v-if="hasSlot('actions')" class="dt__actions"><slot name="actions" /></div>
    </div>

    <SkeletonTable
      v-if="loading && rows.length === 0"
      :columns="visibleColumns"
      :actions="hasSlot('row-actions') ? 1 : 0"
    />

    <template v-else-if="shown.length === 0">
      <div v-if="!narrowing && rows.length === 0 && hasSlot('empty')" class="dt__empty">
        <slot name="empty" />
      </div>
      <div v-else class="dt__none" role="status">
        <p class="dt__none-title">
          {{
            narrowing
              ? `Nenhum resultado${state.q.trim() ? ` para “${state.q.trim()}”` : ""}.`
              : emptyTitle
          }}
        </p>
        <button v-if="narrowing" type="button" class="dt__clear" @click="clearAll">
          Limpar busca e filtros
        </button>
      </div>
    </template>

    <div v-else-if="wide" ref="scroller" class="dt__scroll">
      <table :id="id" class="dt__table" :class="{ 'is-tight': tight }">
        <thead>
          <tr>
            <th v-if="selectable" scope="col" class="dt__select-col">
              <label class="dt__check">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  @change="toggleAll"
                />
                <span class="visually-hidden"
                  >Selecionar todas as linhas ({{ countLabel(shown.length) }})</span
                >
              </label>
            </th>
            <th
              v-for="col in visibleColumns"
              :key="col.key"
              scope="col"
              :class="[`is-${col.align ?? 'left'}`]"
              :style="col.width ? { width: col.width } : undefined"
              :aria-sort="ariaSort(col)"
            >
              <button v-if="col.sortable" type="button" class="dt__sort" @click="sortBy(col)">
                <span :class="{ 'visually-hidden': col.srOnlyLabel }">{{ col.label }}</span>
                <Icon
                  :name="
                    state.sort?.key === col.key
                      ? state.sort.dir === 'asc'
                        ? 'chevron-up'
                        : 'chevron-down'
                      : 'sort'
                  "
                  :size="14"
                  class="dt__sort-icon"
                  :class="{ 'is-on': state.sort?.key === col.key }"
                />
              </button>
              <span v-else :class="{ 'visually-hidden': col.srOnlyLabel }">{{ col.label }}</span>
            </th>
            <th v-if="hasSlot('row-actions')" scope="col" class="dt__actions-col">
              <span class="visually-hidden">Ações</span>
            </th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="dt-row" appear>
          <tr
            v-for="(row, index) in shown"
            :key="rowKey(row)"
            :style="{ '--stagger': `${staggerDelay(index)}ms` }"
            :class="{ 'is-link': !!rowLink, 'is-selected': selectedSet.has(rowKey(row)) }"
            :tabindex="rowLink ? 0 : undefined"
            @click="rowLink ? activate(row, $event) : emit('row-click', row)"
            @keydown.enter.self="activate(row, $event)"
          >
            <td v-if="selectable" class="dt__select-cell">
              <label class="dt__check">
                <input
                  type="checkbox"
                  :checked="selectedSet.has(rowKey(row))"
                  @click="toggleRow(row, $event)"
                />
                <span class="visually-hidden">{{ selectLabel(row) }}</span>
              </label>
            </td>
            <td
              v-for="col in visibleColumns"
              :key="col.key"
              :class="[`is-${col.align ?? 'left'}`, { mono: col.mono }]"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="valueOf(col, row)">
                <span
                  v-if="col.truncate && textOf(col, row) !== '—'"
                  class="dt__trunc"
                  :style="col.width ? { maxWidth: col.width } : undefined"
                >
                  <Tooltip :text="textOf(col, row)"
                    ><span class="dt__trunc-text">{{ textOf(col, row) }}</span></Tooltip
                  >
                </span>
                <template v-else>{{ textOf(col, row) }}</template>
              </slot>
            </td>
            <td v-if="hasSlot('row-actions')" class="dt__row-actions">
              <div class="dt__row-actions-inner"><slot name="row-actions" :row="row" /></div>
            </td>
          </tr>
        </TransitionGroup>
        <tfoot v-if="hasSlot('footer')">
          <slot name="footer" :rows="shown" :columns="footerColumns" />
        </tfoot>
      </table>
    </div>

    <template v-else>
      <label v-if="selectable" class="dt__check dt__select-all">
        <input
          type="checkbox"
          :checked="allSelected"
          :indeterminate="someSelected"
          @change="toggleAll"
        />
        <span>Selecionar todos</span>
      </label>
      <TransitionGroup :id="id" tag="ul" name="dt-row" class="dt__cards" appear>
        <li
          v-for="(row, index) in shown"
          :key="rowKey(row)"
          :style="{ '--stagger': `${staggerDelay(index)}ms` }"
          class="dt__card"
          :class="{
            'is-link': !!rowLink,
            'has-actions-below': cardActions === 'below',
            'is-selectable': selectable,
            'is-selected': selectedSet.has(rowKey(row)),
          }"
          :tabindex="rowLink ? 0 : undefined"
          @click="rowLink ? activate(row, $event) : emit('row-click', row)"
          @keydown.enter.self="activate(row, $event)"
        >
          <label v-if="selectable" class="dt__check dt__card-check">
            <input
              type="checkbox"
              :checked="selectedSet.has(rowKey(row))"
              @click="toggleRow(row, $event)"
            />
            <span class="visually-hidden">{{ selectLabel(row) }}</span>
          </label>
          <slot name="card" :row="row">
            <dl class="dt__pairs">
              <div v-for="col in columns" :key="col.key" class="dt__pair">
                <dt>{{ col.label }}</dt>
                <dd :class="{ mono: col.mono }">
                  <slot :name="`cell-${col.key}`" :row="row" :value="valueOf(col, row)">{{
                    textOf(col, row)
                  }}</slot>
                </dd>
              </div>
            </dl>
          </slot>
          <div v-if="hasSlot('row-actions')" class="dt__card-actions">
            <slot name="row-actions" :row="row" />
          </div>
        </li>
      </TransitionGroup>
      <div v-if="hasSlot('footer')" class="dt__card-footer">
        <slot name="footer" :rows="shown" :columns="columns" />
      </div>
    </template>

    <p v-if="selectable" class="visually-hidden" aria-live="polite">
      {{ selectedRows.length ? selectedLabel(selectedRows.length) : "" }}
    </p>
    <Transition name="dt-bulk">
      <div
        v-if="selectable && selectedRows.length > 0"
        class="dt__bulk"
        role="region"
        :aria-label="`Ações para ${selectedLabel(selectedRows.length)}`"
        @keydown.esc="clearSelection"
      >
        <p class="dt__bulk-count">{{ selectedLabel(selectedRows.length) }}</p>
        <div class="dt__bulk-actions">
          <slot name="bulk-actions" :rows="selectedRows" :clear="clearSelection" />
        </div>
        <button type="button" class="dt__bulk-clear" @click="clearSelection">
          <Icon name="close" :size="16" />Limpar seleção
        </button>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.dt {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-3);
}

.dt__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
}

.dt__search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 220px;
  max-width: 360px;
  color: var(--ink-3);
}

.dt__search > .icon {
  position: absolute;
  left: var(--s-3);
  pointer-events: none;
}

.dt__search-input {
  width: 100%;
  min-height: 44px;
  padding: 0 var(--s-3) 0 calc(var(--s-3) + 26px);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--t-14);
  transition:
    border-color var(--d-fast) var(--ease),
    box-shadow var(--d-fast) var(--ease);
}

.dt__search-input::placeholder {
  color: var(--ink-3);
}

.dt__search-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-wash);
}

.dt__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  align-items: center;
}

.dt__count {
  font-size: var(--t-12);
  color: var(--ink-2);
  white-space: nowrap;
}

.dt__actions {
  margin-left: auto;
  display: flex;
  gap: var(--s-2);
}

.dt__scroll {
  overflow-x: auto;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
}

.dt__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--t-14);
}

.dt__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0 var(--s-4);
  height: 44px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: var(--t-12);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--rule);
}

.dt__table th:first-child {
  border-top-left-radius: var(--r-2);
}

.dt__table th:last-child {
  border-top-right-radius: var(--r-2);
}

.dt__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 44px;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
}

.dt__sort:hover {
  color: var(--ink);
}

.dt__sort-icon {
  opacity: 0.45;
}

.dt__sort-icon.is-on {
  opacity: 1;
  color: var(--brand);
}

.dt__table td {
  padding: var(--s-3) var(--s-4);
  height: 56px;
  border-bottom: 1px solid var(--rule);
  vertical-align: middle;
}

.dt__table tbody tr:last-child td {
  border-bottom: 0;
}

.dt__table tbody tr {
  transition: background-color var(--d-fast) var(--ease);
}

.dt__table tbody tr:hover {
  background: var(--surface-2);
}

.dt__table tr.is-link {
  cursor: pointer;
}

.dt__table tbody tr.is-selected {
  background: var(--brand-wash);
}

.dt__table tr:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

.is-right {
  text-align: right;
}

.is-center {
  text-align: center;
}

th.is-right .dt__sort {
  flex-direction: row-reverse;
}

td.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-stretch: 87.5%;
  white-space: nowrap;
}

.dt__table.is-tight th,
.dt__table.is-tight td {
  padding-left: var(--s-2);
  padding-right: var(--s-2);
}

.dt__table.is-tight th:first-child,
.dt__table.is-tight td:first-child {
  padding-left: var(--s-4);
}

.dt__trunc {
  display: block;
  max-width: 16rem;
  min-width: 4rem;
}

.dt__trunc :deep(.tip-anchor) {
  display: flex;
  max-width: 100%;
}

.dt__trunc-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dt__actions-col {
  width: 1%;
}

.dt__row-actions {
  width: 1%;
  white-space: nowrap;
  padding-right: var(--s-2);
}

.dt__row-actions-inner {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.dt__table :deep(tfoot td) {
  padding: var(--s-3) var(--s-4);
  border-top: 2px solid var(--rule);
  font-weight: 700;
}

.dt__cards {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s-2);
}

.dt__card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
}

.dt__card.has-actions-below {
  grid-template-columns: minmax(0, 1fr);
}

.dt__card.has-actions-below .dt__card-actions {
  justify-content: flex-end;
  margin: 0 calc(var(--s-2) * -1) calc(var(--s-2) * -1) 0;
  padding-top: var(--s-2);
  border-top: 1px dashed var(--rule);
}

.dt__card.is-link {
  cursor: pointer;
}

.dt__card.is-selectable {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.dt__card.is-selectable.has-actions-below {
  grid-template-columns: auto minmax(0, 1fr);
}

.dt__card.is-selectable.has-actions-below .dt__card-actions {
  grid-column: 2;
}

.dt__card.is-selected {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand);
}

.dt__card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.dt__pairs {
  display: grid;
  gap: var(--s-1);
}

.dt__pair {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  font-size: var(--t-14);
}

.dt__pair dt {
  color: var(--ink-2);
}

.dt__pair dd.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.dt__card-actions {
  display: flex;
  gap: 2px;
  margin-right: calc(var(--s-2) * -1);
}

.dt__card-footer {
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-2);
  background: var(--surface-2);
}

.dt__none {
  display: grid;
  justify-items: center;
  gap: var(--s-2);
  padding: var(--s-8) var(--s-4);
  text-align: center;
  background: var(--surface);
  border: 1px dashed var(--rule);
  border-radius: var(--r-2);
}

.dt__none-title {
  font-weight: 600;
}

.dt__clear {
  min-height: 44px;
  color: var(--brand);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* A 44px hit area around a native checkbox in the brand color. */
.dt__check {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 44px;
  min-height: 44px;
  cursor: pointer;
}

.dt__check input {
  width: 18px;
  height: 18px;
  margin: 0 auto;
  accent-color: var(--brand);
  cursor: pointer;
}

.dt__check input:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.dt__table th.dt__select-col,
.dt__table td.dt__select-cell,
.dt__table.is-tight th.dt__select-col,
.dt__table.is-tight td.dt__select-cell {
  width: 1%;
  padding: 0 0 0 var(--s-2);
}

.dt__card-check {
  align-self: start;
  margin: calc(var(--s-2) * -1) 0 0 calc(var(--s-2) * -1);
}

.dt__select-all {
  justify-self: start;
  padding-right: var(--s-2);
  font-size: var(--t-14);
  font-weight: 600;
  color: var(--ink-2);
}

.dt__select-all input {
  margin: 0 0 0 var(--s-3);
}

/* Sticks to the bottom of the screen while the rows scroll past, above the bottom bar. */
.dt__bulk {
  position: sticky;
  z-index: 5;
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--s-2));
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
  background: var(--surface);
  border: 1px solid var(--brand);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-2);
}

@media (min-width: 960px) {
  .dt__bulk {
    bottom: var(--s-4);
  }
}

.dt__bulk-count {
  font-weight: 700;
  white-space: nowrap;
}

.dt__bulk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.dt__bulk-clear {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 44px;
  margin-left: auto;
  padding: 0 var(--s-2);
  border-radius: var(--r-1);
  color: var(--ink-2);
  font-size: var(--t-14);
  font-weight: 600;
}

.dt__bulk-clear:hover {
  color: var(--ink);
  background: var(--surface-2);
}

.dt-bulk-enter-active {
  transition:
    opacity var(--d-base) var(--ease-out),
    transform var(--d-base) var(--ease-out);
}

.dt-bulk-leave-active {
  transition: opacity var(--d-fast) var(--ease-in);
}

.dt-bulk-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.dt-bulk-leave-to {
  opacity: 0;
}

/* Rows fade in with a short stagger on load and when filters change; removed rows fade out. */
.dt-row-enter-active {
  transition:
    opacity var(--d-base) var(--ease-out),
    transform var(--d-base) var(--ease-out);
  transition-delay: var(--stagger, 0ms);
}

.dt-row-leave-active {
  transition: opacity var(--d-fast) var(--ease-in);
}

.dt-row-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.dt-row-leave-to {
  opacity: 0;
}

.dt-row-move {
  transition: transform var(--d-base) var(--ease-out);
}

.dt__card.is-link:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-2);
}

.dt__card {
  transition:
    transform var(--d-base) var(--ease-out),
    box-shadow var(--d-base) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .dt-row-enter-from,
  .dt-bulk-enter-from,
  .dt__card.is-link:hover {
    transform: none;
  }
  .dt-row-move {
    transition: none;
  }
}
</style>
