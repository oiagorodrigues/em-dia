<script setup lang="ts">
import { useId } from "vue";

const model = defineModel<boolean>({ required: true });
const { label, hint } = defineProps<{ label: string; hint?: string }>();
const id = useId();
</script>

<template>
  <label class="tg" :for="id">
    <input
      :id="id"
      v-model="model"
      class="visually-hidden"
      type="checkbox"
      role="switch"
      :aria-describedby="hint ? `${id}-hint` : undefined"
    />
    <span class="tg__track" aria-hidden="true"><span class="tg__knob" /></span>
    <span class="tg__text">
      <span class="tg__label">{{ label }}</span>
      <span v-if="hint" :id="`${id}-hint`" class="tg__hint">{{ hint }}</span>
    </span>
  </label>
</template>

<style scoped>
.tg {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  min-height: 44px;
  cursor: pointer;
}

.tg__track {
  position: relative;
  flex: none;
  width: 44px;
  height: 26px;
  margin-top: 1px;
  border: 1.5px solid var(--ink);
  border-radius: 13px;
  background: var(--surface);
  transition: background-color var(--d-fast) var(--ease);
}

.tg__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--ink);
  transition: transform var(--d-fast) var(--ease);
}

.tg input:checked + .tg__track {
  background: var(--brand);
  border-color: var(--brand);
}

.tg input:checked + .tg__track .tg__knob {
  transform: translateX(18px);
  background: var(--on-ink);
}

.tg input:focus-visible + .tg__track {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.tg__text {
  display: grid;
  gap: 2px;
}

.tg__label {
  font-weight: 600;
  line-height: 1.35;
}

.tg__hint {
  font-size: var(--t-14);
  color: var(--ink-2);
}
</style>
