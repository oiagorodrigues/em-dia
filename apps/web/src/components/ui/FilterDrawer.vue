<script setup lang="ts">
import { ref } from "vue";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import Button from "./Button.vue";
import Icon from "./Icon.vue";
import Sheet from "./Sheet.vue";

const { count = 0, resultLabel } = defineProps<{
  /** Filters currently narrowing the list; shown on the mobile button. */
  count?: number;
  /** e.g. "Ver 12 pessoas"; defaults to "Ver resultados". */
  resultLabel?: string;
}>();
const emit = defineEmits<{ clear: [] }>();

const roomy = useMediaQuery(MQ.md);
const open = ref(false);
</script>

<template>
  <div v-if="roomy" class="fd-inline"><slot /></div>
  <div v-else class="fd">
    <button type="button" class="fd-btn" :class="{ 'is-on': count > 0 }" @click="open = true">
      <Icon name="filter" :size="18" />
      <span>Filtros</span>
      <span v-if="count > 0" class="fd-count mono">{{ count }}</span>
    </button>
    <Sheet v-model:open="open" title="Filtros">
      <div class="fd-body"><slot /></div>
      <template #footer>
        <Button :disabled="count === 0" @click="emit('clear')">Limpar</Button>
        <Button variant="primary" @click="open = false">{{
          resultLabel ?? "Ver resultados"
        }}</Button>
      </template>
    </Sheet>
  </div>
</template>

<style scoped>
.fd-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}

.fd-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: 0 var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
  font-size: var(--t-14);
  transition: border-color var(--d-fast) var(--ease-out);
}

.fd-btn:hover {
  border-color: var(--ink-3);
}

.fd-btn.is-on {
  border-color: var(--brand);
}

.fd-count {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 11px;
  background: var(--brand);
  color: var(--on-ink);
  font-size: 11px;
  text-align: center;
}

.fd-body {
  display: grid;
  gap: var(--s-4);
}

.fd-body :deep(.sel),
.fd-body :deep(select) {
  width: 100%;
}
</style>
