<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import { useCountUp } from "@/lib/motion.ts";
import type { Tone } from "@/lib/tone.ts";
import Icon from "./Icon.vue";
import type { IconName } from "./icons.ts";
import Skeleton from "./Skeleton.vue";

const {
  tone = "brand",
  label,
  value,
  amount,
  format,
  caption,
  icon,
  trend,
  to,
  loading = false,
  projected = false,
} = defineProps<{
  /** Color of the icon chip: brand for hours/paid, amber for pending, coral when something is wrong. */
  tone?: Tone;
  label: string;
  /** Already formatted: "86h40", "R$ 1.234,56". Rendered in mono. */
  value: string;
  /** Raw number behind `value`; with `format` the figure counts up when it changes. */
  amount?: number | null;
  format?: (n: number) => string;
  caption?: string;
  icon?: IconName;
  trend?: { direction: "up" | "down" | "flat"; text: string };
  /** Makes the whole card a link. */
  to?: RouteLocationRaw;
  loading?: boolean;
  /** A forecast, not an actual: dashed outline and a "previsto" tag. */
  projected?: boolean;
}>();

const tag = computed(() => (to ? RouterLink : "div"));
const counted = useCountUp(() => amount);
const display = computed(() =>
  format && counted.value !== null && amount !== undefined && amount !== null
    ? format(counted.value)
    : value,
);
</script>

<template>
  <component :is="tag" :to="to" class="kpi" :class="{ 'is-link': !!to, 'is-projected': projected }">
    <p class="kpi__label">
      <span v-if="icon" class="kpi__chip" :class="`tone-${tone}`"
        ><Icon :name="icon" :size="16"
      /></span>
      <span>{{ label }}</span>
      <span v-if="projected" class="kpi__tag">Previsto</span>
    </p>
    <p v-if="loading" class="kpi__value" aria-busy="true"><Skeleton w="60%" h="1.15em" /></p>
    <p v-else class="kpi__value mono">{{ display }}</p>
    <p v-if="loading && (caption || trend || $slots.default)" class="kpi__caption">
      <Skeleton w="40%" h="12px" />
    </p>
    <p v-else-if="caption || trend || $slots.default" class="kpi__caption">
      <span v-if="trend" class="kpi__trend" :class="`is-${trend.direction}`">
        {{ trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→" }}
        {{ trend.text }}
      </span>
      <span v-if="caption">{{ caption }}</span>
      <slot />
    </p>
  </component>
</template>

<style scoped>
.kpi {
  container-type: inline-size;
  display: grid;
  align-content: start;
  gap: var(--s-2);
  min-width: 0;
  padding: var(--s-4) var(--s-5) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  box-shadow: var(--shadow-1);
  color: var(--ink);
  text-decoration: none;
  transition:
    transform var(--d-base) var(--ease-out),
    box-shadow var(--d-base) var(--ease-out),
    border-color var(--d-base) var(--ease-out);
}

.kpi.is-link:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-2);
}

.kpi.is-link:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.kpi.is-projected {
  border-style: dashed;
  border-color: var(--ink-3);
  box-shadow: none;
}

.kpi__label {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-12);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-2);
}

.kpi__chip {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: var(--r-1);
}

.kpi__tag {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px dashed var(--ink-3);
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0.04em;
}

.kpi__value {
  /* sized by the card, not the viewport: KPI rows can be 1 to 4 wide */
  font-size: clamp(var(--t-20), 11cqi, var(--t-28));
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.kpi__caption {
  display: flex;
  flex-wrap: wrap;
  min-height: calc(var(--t-12) * 1.5);
  gap: var(--s-1) var(--s-2);
  font-size: var(--t-12);
  color: var(--ink-2);
}

.kpi__trend {
  font-weight: 700;
}

.kpi__trend.is-up {
  color: var(--brand);
}

.kpi__trend.is-down {
  color: var(--coral-ink);
}

@media (prefers-reduced-motion: reduce) {
  .kpi.is-link:hover {
    transform: none;
  }
}
</style>
