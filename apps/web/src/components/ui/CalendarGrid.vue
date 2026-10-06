<script setup lang="ts">
import { monthName, parseYearMonth, shiftMonth, toYearMonth } from "@emdia/shared";
import { computed, useTemplateRef } from "vue";
import { inRange, isoToBr, monthGrid } from "@/lib/dateinput.ts";
import Icon from "./Icon.vue";

/** Month shown ("YYYY-MM"). */
const shown = defineModel<string>("month", { required: true });
const { value, today, min, max } = defineProps<{
  value: string;
  today: string;
  min?: string | null;
  max?: string | null;
}>();
const emit = defineEmits<{ pick: [date: string] }>();

const grid = useTemplateRef<HTMLElement>("grid");
const weeks = computed(() => monthGrid(shown.value));
const title = computed(() => {
  const { year, month } = parseYearMonth(shown.value);
  return `${monthName(month)} de ${year}`;
});

/** Arrow keys walk the days like a calendar; the month follows when crossing its edge. */
function onDayKey(e: KeyboardEvent, date: string): void {
  const deltas: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  const d = deltas[e.key];
  if (d === undefined) return;
  e.preventDefault();
  const [y, m, day] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, day + d)).toISOString().slice(0, 10);
  shown.value = toYearMonth(next);
  requestAnimationFrame(() =>
    grid.value?.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus(),
  );
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
</script>

<template>
  <div class="cal">
    <div class="cal__head">
      <button
        type="button"
        class="cal__nav"
        aria-label="Mês anterior"
        @click="shown = shiftMonth(shown, -1)"
      >
        <Icon name="arrow-left" :size="16" />
      </button>
      <p class="cal__title" aria-live="polite">{{ title }}</p>
      <button
        type="button"
        class="cal__nav"
        aria-label="Próximo mês"
        @click="shown = shiftMonth(shown, 1)"
      >
        <Icon name="arrow-right" :size="16" />
      </button>
    </div>
    <div ref="grid" class="cal__grid" role="grid" :aria-label="title">
      <div class="cal__row" role="row">
        <span v-for="(w, i) in WEEKDAYS" :key="i" class="cal__wd" role="columnheader">{{ w }}</span>
      </div>
      <div v-for="(week, wi) in weeks" :key="wi" class="cal__row" role="row">
        <button
          v-for="d in week"
          :key="d.date"
          type="button"
          role="gridcell"
          class="cal__day mono"
          :class="{
            'is-out': !d.inMonth,
            'is-today': d.date === today,
            'is-on': d.date === value,
          }"
          :data-date="d.date"
          :tabindex="d.date === (value || today) ? 0 : -1"
          :disabled="!inRange(d.date, min, max)"
          :aria-selected="d.date === value"
          :aria-label="isoToBr(d.date)"
          @click="emit('pick', d.date)"
          @keydown="onDayKey($event, d.date)"
        >
          {{ d.day }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal {
  display: grid;
  gap: var(--s-2);
  min-width: 260px;
}

.cal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cal__title {
  font-weight: 700;
  text-transform: capitalize;
}

.cal__nav {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--ink-2);
}

.cal__nav:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.cal__grid {
  display: grid;
  gap: 2px;
}

.cal__row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.cal__wd {
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
  padding: var(--s-1) 0;
}

.cal__day {
  aspect-ratio: 1;
  min-height: 36px;
  border-radius: 50%;
  font-size: var(--t-14);
  color: var(--ink);
  transition: background-color var(--d-fast) var(--ease-out);
}

.cal__day:hover:not(:disabled) {
  background: var(--surface-2);
}

.cal__day.is-out {
  color: var(--ink-3);
}

.cal__day.is-today {
  box-shadow: inset 0 0 0 1.5px var(--brand);
}

.cal__day.is-on {
  background: var(--brand);
  color: var(--on-ink);
  font-weight: 700;
}

.cal__day:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
