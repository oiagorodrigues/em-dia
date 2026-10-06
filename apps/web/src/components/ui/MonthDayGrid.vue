<script setup lang="ts">
const model = defineModel<number[]>({ required: true });
const { label, invalid = false } = defineProps<{ label: string; invalid?: boolean }>();

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function toggle(day: number): void {
  model.value = model.value.includes(day)
    ? model.value.filter((d) => d !== day)
    : [...model.value, day].sort((a, b) => a - b);
}
</script>

<template>
  <div class="mdg" :class="{ 'is-invalid': invalid }" role="group" :aria-label="label">
    <button
      v-for="day in DAYS"
      :key="day"
      type="button"
      class="mdg__day mono"
      :class="{ 'is-on': model.includes(day) }"
      :aria-pressed="model.includes(day)"
      :aria-label="`dia ${day}`"
      @click="toggle(day)"
    >
      {{ day }}
    </button>
  </div>
</template>

<style scoped>
.mdg {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  max-width: 420px;
}

.mdg__day {
  height: 44px;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--surface);
  font-size: var(--t-14);
  font-weight: 600;
  color: var(--ink-2);
  transition:
    background-color var(--d-fast) var(--ease),
    color var(--d-fast) var(--ease);
}

.mdg__day:hover {
  border-color: var(--ink-3);
}

.mdg__day.is-on {
  background: var(--brand-wash);
  border-color: var(--brand);
  color: var(--brand);
  font-weight: 700;
}

.is-invalid .mdg__day:not(.is-on) {
  border-color: var(--coral);
}
</style>
