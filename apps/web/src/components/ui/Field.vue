<script setup lang="ts">
import { computed, useId } from "vue";

const {
  label,
  error,
  hint,
  optional = false,
} = defineProps<{
  label: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
}>();

const id = useId();
const describedBy = computed(() => (error ? `${id}-err` : hint ? `${id}-hint` : undefined));
</script>

<template>
  <div class="field" :class="{ 'has-error': !!error }">
    <label class="label field__label" :for="id">
      {{ label }}
      <span v-if="optional" class="field__opt">opcional</span>
    </label>
    <slot :id="id" :invalid="!!error" :described-by="describedBy" />
    <p v-if="error" :id="`${id}-err`" class="field__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="`${id}-hint`" class="field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
/* A row stretches its fields to the tallest one; without this, the extra height of a sibling's
   hint or error is spread between label and input and the inputs stop lining up. */
.field {
  display: grid;
  align-content: start;
  gap: var(--s-2);
}

.field__opt {
  margin-left: var(--s-1);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  color: var(--ink-3);
}

.field__error {
  color: var(--coral-ink);
  font-size: var(--t-14);
  line-height: 1.3;
}

.field__hint {
  color: var(--ink-2);
  font-size: var(--t-14);
  line-height: 1.3;
}
</style>
