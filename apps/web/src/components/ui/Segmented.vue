<script setup lang="ts" generic="T extends string | number">
import { useId } from "vue";

export interface SegmentOption<V> {
  value: V;
  label: string;
}

const model = defineModel<T>({ required: true });
const {
  options,
  label,
  wrap = false,
  invalid = false,
} = defineProps<{
  options: readonly SegmentOption<T>[];
  label: string;
  wrap?: boolean;
  invalid?: boolean;
}>();

const name = useId();
</script>

<template>
  <div
    class="seg"
    :class="{ 'seg--wrap': wrap, 'is-invalid': invalid }"
    role="radiogroup"
    :aria-label="label"
  >
    <label
      v-for="opt in options"
      :key="String(opt.value)"
      class="seg__opt"
      :class="{ 'is-on': model === opt.value }"
    >
      <input v-model="model" class="visually-hidden" type="radio" :name="name" :value="opt.value" />
      <span>{{ opt.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.seg {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 3px;
  border-radius: calc(var(--r-1) + 3px);
  background: var(--surface-2);
  border: 1px solid var(--rule);
}

.seg__opt {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 var(--s-3);
  border-radius: var(--r-1);
  font-size: var(--t-14);
  font-weight: 600;
  text-align: center;
  line-height: 1.15;
  cursor: pointer;
  color: var(--ink-2);
  transition:
    background-color var(--d-fast) var(--ease),
    color var(--d-fast) var(--ease),
    box-shadow var(--d-fast) var(--ease);
}

.seg__opt:hover {
  color: var(--ink);
}

.seg__opt.is-on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-1);
}

.seg__opt:has(:focus-visible) {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

/* Chip variant: free-wrapping options (função, forma de pagamento…). */
.seg--wrap {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  padding: 0;
  border: 0;
  background: none;
}

.seg--wrap .seg__opt {
  flex: none;
  min-height: 44px;
  padding: 0 var(--s-4);
  border: 1px solid var(--rule);
  background: var(--surface);
}

.seg--wrap .seg__opt:hover {
  border-color: var(--ink-3);
}

.seg--wrap .seg__opt.is-on {
  background: var(--brand-wash);
  color: var(--brand);
  border-color: var(--brand);
  box-shadow: none;
}

.seg--wrap .seg__opt:has(:focus-visible) {
  outline-offset: 2px;
}

.is-invalid {
  border-color: var(--coral);
}
</style>
