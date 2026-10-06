<script setup lang="ts">
import { formatDuration } from "@ponto/shared";
import Icon from "./Icon.vue";

const model = defineModel<number>({ required: true });
const {
  id,
  step = 15,
  min = 0,
  max = 720,
  label,
} = defineProps<{
  id?: string;
  step?: number;
  min?: number;
  max?: number;
  label: string;
}>();

function bump(delta: number): void {
  model.value = Math.min(max, Math.max(min, model.value + delta));
}
</script>

<template>
  <div class="stp" role="group" :aria-label="label">
    <button
      type="button"
      class="stp__btn"
      :disabled="model <= min"
      :aria-label="`Menos ${step} minutos`"
      @click="bump(-step)"
    >
      <Icon name="minus" />
    </button>
    <output :id="id" class="stp__val mono" aria-live="polite">{{
      model === 0 ? "sem pausa" : formatDuration(model)
    }}</output>
    <button
      type="button"
      class="stp__btn"
      :disabled="model >= max"
      :aria-label="`Mais ${step} minutos`"
      @click="bump(step)"
    >
      <Icon name="plus" />
    </button>
  </div>
</template>

<style scoped>
.stp {
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--sheet);
  max-width: 260px;
}

.stp__btn {
  display: grid;
  place-items: center;
  height: 48px;
  color: var(--ink);
}

.stp__btn:hover:not(:disabled) {
  background: var(--paper);
}

.stp__btn:disabled {
  color: var(--ink-3);
}

.stp__val {
  text-align: center;
  color: var(--blue);
  font-size: var(--t-16);
  border-left: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
  line-height: 48px;
}
</style>
