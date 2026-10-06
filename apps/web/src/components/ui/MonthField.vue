<script setup lang="ts">
import { monthName, parseYearMonth, shiftMonth, type YearMonth } from "@emdia/shared";
import { computed } from "vue";
import Icon from "./Icon.vue";

const model = defineModel<YearMonth>({ required: true });
const {
  id,
  min,
  max,
  invalid = false,
  describedBy,
  label: name,
} = defineProps<{
  id?: string;
  min?: YearMonth;
  max?: YearMonth;
  invalid?: boolean;
  describedBy?: string;
  /** A <label for> can't point at a spinbutton div, so the name is passed in. */
  label: string;
}>();

const parsed = computed(() => parseYearMonth(model.value));
const label = computed(() => `${monthName(parsed.value.month)} ${parsed.value.year}`);
const canPrev = computed(() => !min || shiftMonth(model.value, -1) >= min);
const canNext = computed(() => !max || shiftMonth(model.value, 1) <= max);

function step(delta: number): void {
  if ((delta < 0 && !canPrev.value) || (delta > 0 && !canNext.value)) return;
  model.value = shiftMonth(model.value, delta);
}

/** Behaves like a spinbutton: arrow keys step, so it works without the side buttons too. */
function onKey(e: KeyboardEvent): void {
  const delta = {
    ArrowUp: 1,
    ArrowRight: 1,
    ArrowDown: -1,
    ArrowLeft: -1,
    PageUp: 12,
    PageDown: -12,
  }[e.key];
  if (delta === undefined) return;
  e.preventDefault();
  step(delta);
}
</script>

<template>
  <div class="mf" :class="{ 'is-invalid': invalid }">
    <button
      type="button"
      class="mf__btn"
      tabindex="-1"
      :disabled="!canPrev"
      aria-hidden="true"
      @click="step(-1)"
    >
      <Icon name="arrow-left" :size="16" />
    </button>
    <div
      :id="id"
      class="mf__value"
      role="spinbutton"
      tabindex="0"
      :aria-label="name"
      :aria-valuetext="label"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      @keydown="onKey"
    >
      <span>{{ monthName(parsed.month) }}</span>
      <span class="mono mf__year">{{ parsed.year }}</span>
    </div>
    <button
      type="button"
      class="mf__btn"
      tabindex="-1"
      :disabled="!canNext"
      aria-hidden="true"
      @click="step(1)"
    >
      <Icon name="arrow-right" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.mf {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 48px;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-bottom-color: var(--ink-2);
  border-radius: var(--r-1);
}

.mf:focus-within {
  border-color: var(--blue);
  box-shadow: inset 0 -1px 0 var(--blue);
}

.mf.is-invalid {
  border-color: var(--red);
}

.mf__btn {
  display: grid;
  place-items: center;
  height: 46px;
  color: var(--ink-2);
}

.mf__btn:hover:not(:disabled) {
  color: var(--ink);
}

.mf__btn:disabled {
  opacity: 0.35;
}

.mf__value {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: var(--s-2);
  color: var(--blue);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  outline: none;
}

.mf__year {
  font-size: var(--t-12);
  font-weight: 500;
}
</style>
