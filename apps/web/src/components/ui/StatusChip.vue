<script setup lang="ts">
import type { Tint } from "@/lib/tint.ts";

const { tone = "neutral", dot = true } = defineProps<{
  tone?: Tint | "neutral" | "green" | "red" | "blue";
  dot?: boolean;
}>();
</script>

<template>
  <span class="chip" :class="`chip--${tone}`"
    ><span v-if="dot" class="chip__dot" aria-hidden="true" /><slot
  /></span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: var(--t-12);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.chip__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.chip--neutral {
  background: var(--surface-2);
  color: var(--ink-2);
}
.chip--green {
  background: var(--green-wash);
  color: var(--tint-mint-ink);
}
.chip--red {
  background: var(--red-wash);
  color: var(--red-text);
}
.chip--blue {
  background: var(--blue-wash);
  color: var(--blue);
}
.chip--mint {
  background: var(--tint-mint);
  color: var(--tint-mint-ink);
}
.chip--peach {
  background: var(--tint-peach);
  color: var(--tint-peach-ink);
}
.chip--butter {
  background: var(--tint-butter);
  color: var(--tint-butter-ink);
}
.chip--sky {
  background: var(--tint-sky);
  color: var(--tint-sky-ink);
}
.chip--rose {
  background: var(--tint-rose);
  color: var(--tint-rose-ink);
}
</style>
