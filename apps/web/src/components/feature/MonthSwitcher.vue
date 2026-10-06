<script setup lang="ts">
import { monthName, parseYearMonth, shiftMonth, type YearMonth } from "@emdia/shared";
import { computed } from "vue";
import Icon from "@/components/ui/Icon.vue";

const model = defineModel<YearMonth>({ required: true });
const { min, max, prefix } = defineProps<{ min?: YearMonth; max?: YearMonth; prefix?: string }>();

const parsed = computed(() => parseYearMonth(model.value));
const prev = computed(() => shiftMonth(model.value, -1));
const next = computed(() => shiftMonth(model.value, 1));
const canPrev = computed(() => !min || prev.value >= min);
const canNext = computed(() => !max || next.value <= max);
</script>

<template>
  <div class="ms">
    <button
      type="button"
      class="ms__btn"
      :disabled="!canPrev"
      :aria-label="`Mês anterior, ${monthName(parseYearMonth(prev).month)}`"
      @click="model = prev"
    >
      <Icon name="arrow-left" />
    </button>
    <h2 class="ms__label" aria-live="polite">
      <span v-if="prefix" class="ms__prefix">{{ prefix }}</span>
      <Transition name="ms" mode="out-in">
        <span :key="model" class="ms__month">
          {{ monthName(parsed.month) }}<span class="ms__year mono">{{ parsed.year }}</span>
        </span>
      </Transition>
    </h2>
    <button
      type="button"
      class="ms__btn"
      :disabled="!canNext"
      :aria-label="`Próximo mês, ${monthName(parseYearMonth(next).month)}`"
      @click="model = next"
    >
      <Icon name="arrow-right" />
    </button>
  </div>
</template>

<style scoped>
.ms {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  gap: var(--s-2);
}

.ms__btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--surface);
  color: var(--ink);
  transition:
    border-color var(--d-fast) var(--ease),
    transform var(--d-fast) var(--ease);
}

.ms__btn:hover:not(:disabled) {
  border-color: var(--ink);
}

.ms__btn:active:not(:disabled) {
  transform: scale(0.94);
}

.ms__btn:disabled {
  opacity: 0.35;
}

.ms__label {
  text-align: center;
  overflow: hidden;
}

.ms__prefix {
  display: block;
  font-size: var(--t-12);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-2);
  margin-bottom: 2px;
}

.ms__month {
  display: inline-flex;
  align-items: baseline;
  gap: var(--s-2);
  font-size: var(--t-40);
  font-weight: 700;
  font-variation-settings: "opsz" 96;
  letter-spacing: -0.04em;
  line-height: 1;
}

.ms__year {
  font-size: var(--t-14);
  font-weight: 500;
  letter-spacing: 0;
  color: var(--ink-2);
}

.ms-enter-active,
.ms-leave-active {
  transition:
    opacity var(--d-fast) var(--ease),
    transform var(--d-fast) var(--ease);
}
.ms-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.ms-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 380px) {
  .ms__month {
    font-size: var(--t-28);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ms-enter-from,
  .ms-leave-to {
    transform: none;
  }
}
</style>
