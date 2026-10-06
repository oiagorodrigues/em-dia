<script setup lang="ts">
import { WEEKDAY_LETTER, WEEKDAY_LONG } from "@/lib/format.ts";

const model = defineModel<number[]>({ required: true });
const { label } = defineProps<{ label: string }>();

/** Monday first, the way a household thinks about the work week. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function toggle(day: number): void {
  model.value = model.value.includes(day)
    ? model.value.filter((d) => d !== day)
    : [...model.value, day].sort((a, b) => a - b);
}
</script>

<template>
  <div class="wd" role="group" :aria-label="label">
    <button
      v-for="day in ORDER"
      :key="day"
      type="button"
      class="wd__day mono"
      :class="{ 'is-on': model.includes(day) }"
      :aria-pressed="model.includes(day)"
      :aria-label="WEEKDAY_LONG[day]"
      @click="toggle(day)"
    >
      {{ WEEKDAY_LETTER[day] }}
    </button>
  </div>
</template>

<style scoped>
.wd {
  display: grid;
  grid-template-columns: repeat(7, minmax(44px, 1fr));
  gap: 4px;
  max-width: 420px;
}

.wd__day {
  height: 48px;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--sheet);
  font-size: var(--t-16);
  font-weight: 600;
  color: var(--ink-2);
  transition:
    background-color var(--d-fast) var(--ease),
    color var(--d-fast) var(--ease),
    transform var(--d-fast) var(--ease);
}

.wd__day:hover {
  border-color: var(--ink-3);
}

.wd__day:active {
  transform: scale(0.95);
}

.wd__day.is-on {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--sheet);
}

@media (max-width: 360px) {
  .wd {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}
</style>
