<script setup lang="ts">
import Skeleton from "./Skeleton.vue";

/** Placeholder for the month ledger: label, dotted leader, value, and the double-ruled total. */
const { lines = 4, total = true } = defineProps<{ lines?: number; total?: boolean }>();

const LABEL_WIDTHS = ["38%", "28%", "44%", "32%", "24%"];
</script>

<template>
  <div class="sk-ledger" aria-busy="true">
    <div v-for="i in lines" :key="i" class="sk-ledger__line">
      <Skeleton :w="LABEL_WIDTHS[(i - 1) % LABEL_WIDTHS.length]" h="12px" />
      <span class="sk-ledger__lead" />
      <Skeleton w="18%" h="12px" />
    </div>
    <div v-if="total" class="sk-ledger__line sk-ledger__total">
      <Skeleton w="30%" h="16px" />
      <span class="sk-ledger__lead" />
      <Skeleton w="28%" h="22px" />
    </div>
  </div>
</template>

<style scoped>
.sk-ledger {
  display: grid;
  gap: var(--s-2);
}

.sk-ledger__line {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: calc(var(--t-14) * 1.5);
}

.sk-ledger__lead {
  flex: 1;
  min-width: var(--s-4);
  border-bottom: 2px dotted var(--rule);
}

.sk-ledger__total {
  min-height: calc(var(--t-20) * 1.5 + var(--s-3) + 3px);
  margin-top: var(--s-2);
  padding-top: var(--s-3);
  border-top: 3px double var(--rule);
}
</style>
