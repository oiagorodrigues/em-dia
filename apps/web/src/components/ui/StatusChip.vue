<script setup lang="ts">
import type { Tone } from "@/lib/tone.ts";

const { tone = "neutral", dot = true } = defineProps<{ tone?: Tone; dot?: boolean }>();
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
.chip--brand {
  background: var(--brand-wash);
  color: var(--brand-ink);
}
.chip--amber {
  background: var(--amber-wash);
  color: var(--amber-ink);
}
.chip--coral {
  background: var(--coral-wash);
  color: var(--coral-ink);
}
</style>
