<script setup lang="ts">
import { OCCUPATION_LABEL, weekdayOf, type IsoDate, type YearMonth } from "@emdia/shared";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import Avatar from "@/components/ui/Avatar.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import { rowTotals, stripDates, type BoardRow } from "@/lib/board.ts";
import { formatDayMonth, WEEKDAY_LETTER, WEEKDAY_SHORT } from "@/lib/format.ts";
import BoardCell from "./BoardCell.vue";

const {
  rows,
  month,
  today,
  currentMonth,
  projected = false,
} = defineProps<{
  rows: readonly BoardRow[];
  month: YearMonth;
  today: IsoDate;
  currentMonth: YearMonth;
  /** A future month: totals are the estimate. */
  projected?: boolean;
}>();

const week = computed(() => stripDates(month, today));

function stripOf(row: BoardRow) {
  const byDate = new Map(row.cells.map((c) => [c.date, c]));
  return week.value.map((date) => {
    const cell = byDate.get(date);
    return (
      cell ?? {
        date,
        day: Number(date.slice(8)),
        weekday: weekdayOf(date),
        kind: "outside" as const,
        isToday: date === today,
        tip: "",
        label: `${WEEKDAY_SHORT[weekdayOf(date)]}, ${formatDayMonth(date)}: outro mês`,
      }
    );
  });
}

function link(row: BoardRow) {
  return {
    path: `/equipe/${row.item.contract.id}`,
    query: month === currentMonth ? {} : { mes: month },
  };
}
</script>

<template>
  <ul class="bw" aria-label="Quadro da semana">
    <li v-for="row in rows" :key="row.item.contract.id">
      <RouterLink :to="link(row)" class="bw__card">
        <span class="bw__head">
          <Avatar :name="row.item.contract.workerName" :size="40" />
          <span class="bw__who">
            <strong>{{ row.item.contract.workerName }}</strong>
            <span class="bw__sub">
              {{ OCCUPATION_LABEL[row.item.contract.occupation] }}
              <StatusChip v-if="row.item.contract.status === 'ended'" tone="neutral" :dot="false"
                >Encerrado</StatusChip
              >
            </span>
          </span>
        </span>
        <span class="bw__strip">
          <span
            v-for="c in stripOf(row)"
            :key="c.date"
            class="bw__day"
            :class="{ 'is-today': c.isToday }"
          >
            <span class="bw__wd" aria-hidden="true">{{ WEEKDAY_LETTER[c.weekday] }}</span>
            <BoardCell :kind="c.kind" :label="c.label" :today="c.isToday" />
            <span class="bw__dn mono" aria-hidden="true">{{ c.day }}</span>
          </span>
        </span>
        <span class="bw__totals" :class="{ 'is-projected': projected }">
          <span
            ><span class="label">Horas</span
            ><span class="mono">{{ rowTotals(row.item, projected).hours }}</span></span
          >
          <span
            ><span class="label">Dias</span
            ><span class="mono">{{ rowTotals(row.item, projected).days }}</span></span
          >
          <span
            ><span class="label">{{ projected ? "Previsto" : "A pagar" }}</span
            ><span class="mono bw__due">{{ rowTotals(row.item, projected).due }}</span></span
          >
        </span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.bw {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s-3);
}

.bw__card {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
  color: inherit;
  text-decoration: none;
}

.bw__card:active {
  background: var(--surface-2);
}

.bw__card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.bw__head {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.bw__who {
  flex: 1;
  display: grid;
  min-width: 0;
}

.bw__who strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bw__sub {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-12);
  color: var(--ink-2);
}

.bw__chev {
  color: var(--ink-3);
}

.bw__strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.bw__day {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 4px 0;
  border-radius: var(--r-1);
}

.bw__day :deep(.bcell) {
  max-width: 30px;
}

.bw__day.is-today {
  background: var(--brand-wash);
}

.bw__wd {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
}

.bw__day.is-today .bw__wd,
.bw__day.is-today .bw__dn {
  color: var(--brand);
  font-weight: 700;
}

.bw__dn {
  font-size: 11px;
  font-stretch: 87.5%;
  color: var(--ink-2);
}

.bw__totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-2);
  padding-top: var(--s-3);
  border-top: 1px dashed var(--rule);
}

.bw__totals.is-projected {
  border-top-color: var(--ink-3);
}

.bw__totals.is-projected .mono {
  color: var(--ink-2);
}

.bw__totals > span {
  display: grid;
  gap: 2px;
}

.bw__totals > span:last-child {
  text-align: right;
}

.bw__totals .label {
  font-size: 11px;
}

.bw__totals .mono {
  font-size: var(--t-14);
  font-weight: 600;
  font-stretch: 87.5%;
}
</style>
