<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
import type { IconName } from "@/components/ui/icons.ts";
import { computed, onBeforeUnmount, ref } from "vue";
import { useNow } from "@/composables/now.ts";
import type { ClockState } from "@/lib/entry.ts";

const {
  state,
  loading = false,
  size = 200,
} = defineProps<{
  state: ClockState;
  loading?: boolean;
  size?: number;
}>();

const emit = defineEmits<{ press: [action: "in" | "out"] }>();

const { zoned, seconds } = useNow();
const stamping = ref(false);
let stampTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(stampTimer));

const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * Math.PI * 2;
  const major = i % 5 === 0;
  const r1 = major ? 84 : 88;
  return {
    major,
    x1: 100 + Math.sin(a) * r1,
    y1: 100 - Math.cos(a) * r1,
    x2: 100 + Math.sin(a) * 94,
    y2: 100 - Math.cos(a) * 94,
  };
});

const secondDot = computed(() => {
  const a = (seconds.value / 60) * Math.PI * 2;
  return { cx: 100 + Math.sin(a) * 76, cy: 100 - Math.cos(a) * 76 };
});

const label = computed(() => {
  switch (state) {
    case "in":
      return "Bater entrada";
    case "out":
      return "Bater saída";
    case "done":
      return "Dia fechado";
    default:
      return "Sem expediente";
  }
});

const icon = computed<IconName | null>(() =>
  state === "in" ? "clock-in" : state === "out" ? "clock-out" : null,
);

const disabled = computed(() => loading || state === "done" || state === "off");

function press(): void {
  if (disabled.value || (state !== "in" && state !== "out")) return;
  stamping.value = false;
  clearTimeout(stampTimer);
  requestAnimationFrame(() => {
    stamping.value = true;
    stampTimer = setTimeout(() => (stamping.value = false), 600);
  });
  emit("press", state);
}
</script>

<template>
  <button
    type="button"
    class="clock"
    :class="[`clock--${state}`, { 'is-stamping': stamping, 'is-loading': loading }]"
    :style="{ '--size': `${size}px` }"
    :disabled="disabled"
    :aria-label="`${label}, agora ${zoned.time}`"
    :aria-busy="loading || undefined"
    @click="press"
  >
    <svg class="clock__ring" viewBox="0 0 200 200" aria-hidden="true">
      <circle class="clock__rim" cx="100" cy="100" r="97" />
      <line
        v-for="(t, i) in TICKS"
        :key="i"
        :x1="t.x1"
        :y1="t.y1"
        :x2="t.x2"
        :y2="t.y2"
        :class="t.major ? 'tick tick--major' : 'tick'"
      />
      <circle class="clock__sec" :cx="secondDot.cx" :cy="secondDot.cy" r="4" />
    </svg>
    <span class="clock__face">
      <span class="clock__time mono">{{ zoned.time }}</span>
      <span class="clock__label">
        <Icon v-if="!loading && icon" :name="icon" :size="16" />
        {{ loading ? "Carimbando…" : label }}
      </span>
    </span>
    <span class="clock__splash" aria-hidden="true" />
  </button>
</template>

<style scoped>
.clock {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  min-width: 168px;
  min-height: 168px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--rule);
  box-shadow: var(--shadow-2);
  transition:
    transform var(--d-fast) var(--ease),
    box-shadow var(--d-fast) var(--ease),
    background-color var(--d-base) var(--ease);
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}

.clock:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 8px 20px rgb(16 24 20 / 0.12),
    0 20px 48px rgb(16 24 20 / 0.08);
}

.clock:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: var(--shadow-1);
}

.clock:focus-visible {
  outline-offset: 6px;
}

.clock--done,
.clock--off {
  box-shadow: none;
  border-color: var(--rule);
  cursor: default;
}

.clock:disabled {
  opacity: 1;
}

.clock__ring {
  position: absolute;
  inset: 6%;
  width: 88%;
  height: 88%;
}

.tick {
  stroke: var(--ink-3);
  stroke-width: 1.5;
  stroke-linecap: round;
}

.tick--major {
  stroke: var(--ink);
  stroke-width: 2.5;
}

.clock--done .tick--major,
.clock--off .tick--major {
  stroke: var(--ink-3);
}

.clock__sec {
  fill: var(--coral);
}

.clock__face {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 2px;
}

.clock__time {
  font-size: calc(var(--size) * 0.155);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1;
}

.clock__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--t-14);
  font-weight: 700;
  color: var(--brand);
  letter-spacing: -0.01em;
}

.clock--out .clock__label {
  color: var(--amber-ink);
}

.clock__rim {
  fill: none;
  stroke: var(--brand);
  stroke-width: 3;
  opacity: 0.85;
}

.clock--done .clock__rim,
.clock--off .clock__rim {
  stroke: var(--rule);
}

.clock--done .clock__label,
.clock--off .clock__label {
  color: var(--ink-2);
  font-weight: 500;
}

.clock--done .clock__time,
.clock--off .clock__time {
  color: var(--ink-2);
}

.is-loading .clock__label {
  color: var(--ink-2);
}

.clock__splash {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  border: 6px solid var(--brand);
  opacity: 0;
  pointer-events: none;
}

.is-stamping {
  animation: stamp var(--d-stamp) var(--ease);
}

.is-stamping .clock__splash {
  animation: splash 520ms var(--ease);
}

@keyframes stamp {
  0% {
    transform: scale(0.96);
  }
  100% {
    transform: none;
  }
}

@keyframes splash {
  0% {
    opacity: 0.7;
    transform: scale(0.92);
  }
  100% {
    opacity: 0;
    transform: scale(1.18);
    border-width: 1px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .clock:hover:not(:disabled),
  .clock:active:not(:disabled) {
    transform: none;
  }
}
</style>
