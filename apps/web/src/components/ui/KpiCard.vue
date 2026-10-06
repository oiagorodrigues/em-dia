<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import type { Tint } from "@/lib/tint.ts";
import Icon from "./Icon.vue";
import type { IconName } from "./icons.ts";
import Skeleton from "./Skeleton.vue";

const {
  tint = "mint",
  label,
  value,
  caption,
  icon,
  trend,
  to,
  loading = false,
} = defineProps<{
  tint?: Tint;
  label: string;
  /** Already formatted: "86h40", "R$ 1.234,56". Rendered in mono. */
  value: string;
  caption?: string;
  icon?: IconName;
  trend?: { direction: "up" | "down" | "flat"; text: string };
  /** Makes the whole card a link. */
  to?: RouteLocationRaw;
  loading?: boolean;
}>();

const tag = computed(() => (to ? RouterLink : "div"));
</script>

<template>
  <component :is="tag" :to="to" class="kpi" :class="[`tint-${tint}`, { 'is-link': !!to }]">
    <p class="kpi__label">
      <Icon v-if="icon" :name="icon" :size="16" />
      <span>{{ label }}</span>
    </p>
    <Skeleton v-if="loading" w="60%" h="34px" />
    <p v-else class="kpi__value mono">{{ value }}</p>
    <p v-if="caption || trend || $slots.default" class="kpi__caption">
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
  border-radius: var(--r-3);
  text-decoration: none;
  transition:
    transform var(--d-fast) var(--ease),
    box-shadow var(--d-fast) var(--ease);
}

.kpi.is-link:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-1);
}

.kpi.is-link:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}

.kpi__label {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-12);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.kpi__value {
  /* sized by the card, not the viewport: KPI rows can be 2 or 4 wide */
  font-size: clamp(var(--t-16), 11cqi, var(--t-28));
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.15;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.kpi__caption {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1) var(--s-2);
  font-size: var(--t-12);
  opacity: 0.9;
}

.kpi__trend {
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .kpi.is-link:hover {
    transform: none;
  }
}
</style>
