<script setup lang="ts" generic="T">
import { computed, reactive, useId, useSlots } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import {
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
import Skeleton from "./Skeleton.vue";

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
}>();

const emit = defineEmits<{ "row-click": [row: T]; "clear-filters": [] }>();

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
  /** Totals row (table) / summary (cards). */
  footer?: (props: { rows: readonly T[] }) => unknown;
}>();

const router = useRouter();
const id = useId();
const wide = useMediaQuery(MQ.md);
const lg = useMediaQuery(MQ.lg);
const xl = useMediaQuery(MQ.xl);
const xxl = useMediaQuery(MQ["2xl"]);

const internal = reactive<TableState>({ q: "", sort: defaultSort, filters: {} });
const state = computed(() => externalState ?? internal);

const visibleColumns = computed(() =>
  columns.filter(
    (c) => !c.hideBelow || { lg: lg.value, xl: xl.value, "2xl": xxl.value }[c.hideBelow],
  ),
);

const filtered = computed(() => (filter ? rows.filter(filter) : [...rows]));
const searched = computed(() => searchRows(filtered.value, columns, state.value.q));
const shown = computed(() => sortRows(searched.value, columns, state.value.sort));
const narrowing = computed(() => filtersActive || !!state.value.q.trim());

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
    target instanceof Element && !!target.closest("button, a, input, select, [role='menuitem']")
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
        :result-label="`ver ${countLabel(shown.length)}`"
        @clear="clearAll"
        ><slot name="filters"
      /></FilterDrawer>
      <p class="dt__count" aria-live="polite">
        {{ loading ? "carregando…" : countLabel(shown.length) }}
      </p>
      <div v-if="hasSlot('actions')" class="dt__actions"><slot name="actions" /></div>
    </div>

    <div v-if="loading && rows.length === 0" class="dt__loading" aria-busy="true">
      <Skeleton v-for="i in 5" :key="i" h="52px" :gap="i === 1 ? '0' : '6px'" />
    </div>

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
          limpar busca e filtros
        </button>
      </div>
    </template>

    <div v-else-if="wide" class="dt__scroll">
      <table :id="id" class="dt__table">
        <thead>
          <tr>
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
            :class="{ 'is-link': !!rowLink }"
            :tabindex="rowLink ? 0 : undefined"
            @click="rowLink ? activate(row, $event) : emit('row-click', row)"
            @keydown.enter.self="activate(row, $event)"
          >
            <td
              v-for="col in visibleColumns"
              :key="col.key"
              :class="[`is-${col.align ?? 'left'}`, { mono: col.mono }]"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="valueOf(col, row)">{{
                textOf(col, row)
              }}</slot>
            </td>
            <td v-if="hasSlot('row-actions')" class="dt__row-actions">
              <div class="dt__row-actions-inner"><slot name="row-actions" :row="row" /></div>
            </td>
          </tr>
        </TransitionGroup>
        <tfoot v-if="hasSlot('footer')">
          <slot name="footer" :rows="shown" />
        </tfoot>
      </table>
    </div>

    <template v-else>
      <TransitionGroup :id="id" tag="ul" name="dt-row" class="dt__cards" appear>
        <li
          v-for="(row, index) in shown"
          :key="rowKey(row)"
          :style="{ '--stagger': `${staggerDelay(index)}ms` }"
          class="dt__card"
          :class="{ 'is-link': !!rowLink, 'has-actions-below': cardActions === 'below' }"
          :tabindex="rowLink ? 0 : undefined"
          @click="rowLink ? activate(row, $event) : emit('row-click', row)"
          @keydown.enter.self="activate(row, $event)"
        >
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
        <slot name="footer" :rows="shown" />
      </div>
    </template>
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

.dt__loading {
  padding: var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
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
  .dt__card.is-link:hover {
    transform: none;
  }
  .dt-row-move {
    transition: none;
  }
}
</style>
