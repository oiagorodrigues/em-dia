<script setup lang="ts">
import {
  formatCents,
  formatDuration,
  OCCUPATION_LABEL,
  type IsoDate,
  type YearMonth,
} from "@emdia/shared";
import { computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import Avatar from "@/components/ui/Avatar.vue";
import Icon from "@/components/ui/Icon.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import type { BoardRow } from "@/lib/board.ts";
import { WEEKDAY_LETTER } from "@/lib/format.ts";
import { attendanceText } from "@/lib/schedule.ts";
import type { SortDir, SortState } from "@/lib/table.ts";
import BoardCell from "./BoardCell.vue";

const { rows, month, today, sort } = defineProps<{
  rows: readonly BoardRow[];
  month: YearMonth;
  today: IsoDate;
  sort: SortState | null;
  /** The month the app is in; links to a person's card drop `?mes=` for it. */
  currentMonth: YearMonth;
}>();

const emit = defineEmits<{ sort: [key: string, firstDir: SortDir] }>();
const router = useRouter();

const days = computed(() => rows[0]?.cells ?? []);

const totals = computed(() =>
  rows.reduce(
    (t, r) => ({
      minutes: t.minutes + r.item.summary.totalMinutes,
      due: t.due + Math.max(0, r.item.summary.balanceCents),
    }),
    { minutes: 0, due: 0 },
  ),
);

function cardLink(row: BoardRow, currentMonth: YearMonth) {
  return {
    path: `/equipe/${row.item.contract.id}`,
    query: month === currentMonth ? {} : { mes: month },
  };
}

function ariaSort(key: string): "ascending" | "descending" | "none" {
  if (sort?.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

function sortIcon(key: string) {
  if (sort?.key !== key) return "sort" as const;
  return sort.dir === "asc" ? ("chevron-up" as const) : ("chevron-down" as const);
}

function cellsOf(tr: Element | null): HTMLElement[] {
  return tr ? [...tr.querySelectorAll<HTMLElement>(".bcell")] : [];
}

/**
 * Rows are Tab stops; arrows move between days (and rows) inside the board,
 * Enter opens the person's card, Esc goes back to the row.
 */
function onKeydown(e: KeyboardEvent, row: BoardRow, currentMonth: YearMonth): void {
  const tr = e.currentTarget as HTMLElement;
  const target = e.target as HTMLElement;
  const onCell = target.classList.contains("bcell");
  const cells = cellsOf(tr);
  const index = onCell ? cells.indexOf(target) : -1;

  const move = (el: HTMLElement | undefined | null) => {
    if (!el) return;
    e.preventDefault();
    el.focus();
  };

  switch (e.key) {
    case "Enter":
      if (target === tr || onCell) {
        e.preventDefault();
        void router.push(cardLink(row, currentMonth));
      }
      return;
    case "ArrowRight":
      return move(
        onCell
          ? cells[index + 1]
          : (cells.find((c) => c.classList.contains("is-today")) ?? cells[0]),
      );
    case "ArrowLeft":
      return move(onCell ? cells[index - 1] : cells[cells.length - 1]);
    case "Home":
      return onCell ? move(cells[0]) : undefined;
    case "End":
      return onCell ? move(cells[cells.length - 1]) : undefined;
    case "ArrowDown":
    case "ArrowUp": {
      const sibling = (
        e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling
      ) as HTMLElement | null;
      if (!sibling) return;
      return move(onCell ? cellsOf(sibling)[index] : sibling);
    }
    case "Escape":
      return onCell ? move(tr) : undefined;
  }
}

function onClick(e: MouseEvent, row: BoardRow, currentMonth: YearMonth): void {
  if ((e.target as Element).closest("a, button")) return;
  void router.push(cardLink(row, currentMonth));
}
</script>

<template>
  <div class="bg__scroll">
    <table class="bg" :aria-label="`Quadro do mês, ${rows.length} pessoas`">
      <thead>
        <tr>
          <th scope="col" class="bg__name" :aria-sort="ariaSort('nome')">
            <button type="button" class="bg__sort" @click="emit('sort', 'nome', 'asc')">
              profissional
              <Icon
                :name="sortIcon('nome')"
                :size="14"
                class="bg__sort-icon"
                :class="{ 'is-on': sort?.key === 'nome' }"
              />
            </button>
          </th>
          <th
            v-for="d in days"
            :key="d.date"
            scope="col"
            class="bg__day"
            :class="{ 'is-today': d.isToday, 'is-weekend': d.isWeekend }"
            :aria-current="d.isToday ? 'date' : undefined"
          >
            <span class="bg__wd" aria-hidden="true">{{ WEEKDAY_LETTER[d.weekday] }}</span>
            <span class="bg__dn mono">{{ d.day }}</span>
          </th>
          <th scope="col" class="bg__total" :aria-sort="ariaSort('horas')">
            <button type="button" class="bg__sort" @click="emit('sort', 'horas', 'desc')">
              horas
              <Icon
                :name="sortIcon('horas')"
                :size="14"
                class="bg__sort-icon"
                :class="{ 'is-on': sort?.key === 'horas' }"
              />
            </button>
          </th>
          <th scope="col" class="bg__total">dias</th>
          <th scope="col" class="bg__total" :aria-sort="ariaSort('apagar')">
            <button type="button" class="bg__sort" @click="emit('sort', 'apagar', 'desc')">
              a pagar
              <Icon
                :name="sortIcon('apagar')"
                :size="14"
                class="bg__sort-icon"
                :class="{ 'is-on': sort?.key === 'apagar' }"
              />
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.item.contract.id"
          tabindex="0"
          :aria-label="`${row.item.contract.workerName}: abrir o cartão`"
          @click="onClick($event, row, currentMonth)"
          @keydown="onKeydown($event, row, currentMonth)"
        >
          <th scope="row" class="bg__name">
            <span class="bg__who">
              <Avatar :name="row.item.contract.workerName" :size="32" />
              <span class="bg__who-text">
                <RouterLink :to="cardLink(row, currentMonth)" class="bg__link" tabindex="-1">{{
                  row.item.contract.workerName
                }}</RouterLink>
                <span class="bg__sub">
                  {{ OCCUPATION_LABEL[row.item.contract.occupation] }}
                  <StatusChip
                    v-if="row.item.contract.status === 'ended'"
                    tone="neutral"
                    :dot="false"
                    >encerrado</StatusChip
                  >
                </span>
              </span>
            </span>
          </th>
          <td
            v-for="c in row.cells"
            :key="c.date"
            class="bg__td"
            :class="{ 'is-today': c.isToday, 'is-weekend': c.isWeekend }"
          >
            <BoardCell :kind="c.kind" :label="c.label" :tip="c.tip" focusable />
          </td>
          <td class="bg__total mono">{{ formatDuration(row.item.summary.totalMinutes) }}</td>
          <td class="bg__total mono">
            {{ attendanceText(row.item.summary, row.item.contract.schedule.kind) }}
          </td>
          <td
            class="bg__total mono bg__due"
            :class="{ 'is-zero': row.item.summary.balanceCents <= 0 }"
          >
            {{ formatCents(Math.max(0, row.item.summary.balanceCents)) }}
          </td>
        </tr>
      </tbody>
      <tfoot v-if="rows.length > 1">
        <tr>
          <th scope="row" class="bg__name bg__foot-label">total</th>
          <td :colspan="days.length" />
          <td class="bg__total mono">{{ formatDuration(totals.minutes) }}</td>
          <td />
          <td class="bg__total mono">{{ formatCents(totals.due) }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.bg__scroll {
  overflow-x: auto;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
}

.bg {
  width: 100%;
  min-width: 960px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: var(--t-14);
}

.bg th,
.bg td {
  border-bottom: 1px solid var(--rule);
}

.bg thead th {
  height: 52px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: var(--t-12);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.bg__name {
  position: sticky;
  left: 0;
  z-index: 2;
  width: 192px;
  padding: 0 var(--s-4);
  text-align: left;
  background: var(--surface);
  border-right: 1px solid var(--rule);
}

thead .bg__name {
  background: var(--surface-2);
}

.bg__day {
  padding: 0;
  text-align: center;
  text-transform: none !important;
  letter-spacing: 0 !important;
}

.bg__wd,
.bg__dn {
  display: block;
  line-height: 1.2;
}

.bg__wd {
  font-size: 10px;
  color: var(--ink-3);
}

.bg__dn {
  font-size: 11px;
  font-stretch: 87.5%;
}

.bg__day.is-today {
  color: var(--blue);
}

.bg__day.is-today .bg__dn {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 20px;
  border-radius: 999px;
  background: var(--blue);
  color: var(--on-ink);
  font-weight: 700;
}

.bg__td {
  padding: 10px 2px;
  vertical-align: middle;
}

.bg__td :deep(.bcell) {
  max-width: 26px;
  margin: 0 auto;
}

.is-weekend {
  background: color-mix(in srgb, var(--surface-2) 55%, transparent);
}

.is-today:not(th.bg__day) {
  background: color-mix(in srgb, var(--blue-wash) 70%, transparent);
}

thead .bg__day.is-weekend {
  background: color-mix(in srgb, var(--rule) 45%, var(--surface-2));
}

thead .bg__day.is-today {
  background: var(--blue-wash);
}

.bg__total {
  width: 76px;
  padding: 0 var(--s-3);
  text-align: right;
  white-space: nowrap;
}

td.bg__total {
  font-variant-numeric: tabular-nums;
  font-stretch: 87.5%;
}

thead .bg__total:last-child,
tbody .bg__due {
  width: 116px;
}

.bg__due.is-zero {
  color: var(--ink-3);
}

.bg__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 44px;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
}

.bg__total .bg__sort {
  flex-direction: row-reverse;
}

.bg__sort:hover {
  color: var(--ink);
}

.bg__sort-icon {
  opacity: 0.45;
}

.bg__sort-icon.is-on {
  opacity: 1;
  color: var(--blue);
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover > *,
tbody tr:focus-within > * {
  background-color: var(--surface-2);
}

tbody tr:hover > .is-today,
tbody tr:focus-within > .is-today {
  background-color: var(--blue-wash);
}

tbody tr:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
}

tbody tr:last-child > * {
  border-bottom: 0;
}

.bg__who {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
  padding: var(--s-2) 0;
}

.bg__who-text {
  display: grid;
  min-width: 0;
}

.bg__link {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
}

.bg__link:hover {
  text-decoration: underline;
}

.bg__sub {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-12);
  font-weight: 400;
  color: var(--ink-2);
  white-space: nowrap;
}

.bg__sub :deep(.chip) {
  min-height: 20px;
  padding: 0 6px;
  font-size: 11px;
}

tfoot > tr > * {
  height: 48px;
  border-top: 2px solid var(--rule);
  border-bottom: 0;
  font-weight: 700;
}

.bg__foot-label {
  font-size: var(--t-12);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-2);
}

@media (min-width: 1600px) {
  .bg__name {
    width: 240px;
  }
  .bg__total {
    width: 92px;
  }
  .bg__td :deep(.bcell) {
    max-width: 30px;
  }
}
</style>
