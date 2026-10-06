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
  border: 1px solid var(--ink);
  border-radius: var(--r-1);
  overflow: hidden;
  background: var(--sheet);
}

.seg__opt {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 var(--s-3);
  font-size: var(--t-14);
  font-weight: 600;
  text-align: center;
  line-height: 1.15;
  cursor: pointer;
  color: var(--ink-2);
  transition:
    background-color var(--d-fast) var(--ease),
    color var(--d-fast) var(--ease);
}

.seg__opt + .seg__opt {
  border-left: 1px solid var(--rule);
}

.seg__opt:hover {
  color: var(--ink);
}

.seg__opt.is-on {
  background: var(--ink);
  color: var(--sheet);
}

.seg__opt:has(:focus-visible) {
  outline: 2px solid var(--blue);
  outline-offset: -4px;
}

.seg--wrap {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  border: 0;
  background: none;
  overflow: visible;
}

.seg--wrap .seg__opt {
  flex: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--sheet);
  padding: 0 var(--s-4);
}

.seg--wrap .seg__opt + .seg__opt {
  border-left: 1px solid var(--rule);
}

.seg--wrap .seg__opt.is-on {
  background: var(--ink);
  color: var(--sheet);
  border-color: var(--ink);
}

.seg--wrap .seg__opt:has(:focus-visible) {
  outline-offset: 2px;
}

.is-invalid {
  border-color: var(--red);
}
</style>
