<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import Icon from "./Icon.vue";
import type { IconName } from "./icons.ts";

const {
  icon,
  label,
  to,
  href,
  tone = "neutral",
  disabled = false,
  loading = false,
  tooltip = true,
} = defineProps<{
  icon: IconName;
  /** Accessible name and tooltip text. */
  label: string;
  to?: RouteLocationRaw;
  href?: string;
  tone?: "neutral" | "blue" | "danger";
  disabled?: boolean;
  loading?: boolean;
  tooltip?: boolean;
}>();

const tag = computed(() => (to ? RouterLink : href ? "a" : "button"));
const attrs = computed(() => {
  if (to) return { to };
  if (href) return { href, target: "_blank", rel: "noopener noreferrer" };
  return { type: "button", disabled: disabled || loading };
});
</script>

<template>
  <component
    :is="tag"
    v-bind="attrs"
    class="ib"
    :class="[`ib--${tone}`, { 'is-loading': loading }]"
    :aria-label="label"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="ib__spin" aria-hidden="true" />
    <Icon v-else :name="icon" :size="18" />
    <span v-if="tooltip" class="ib__tip" role="tooltip" aria-hidden="true">{{ label }}</span>
  </component>
</template>

<style scoped>
.ib {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--r-1);
  color: var(--ink-2);
  text-decoration: none;
  transition:
    background-color var(--d-fast) var(--ease),
    color var(--d-fast) var(--ease);
}

/* 40px visible, 44px hit area */
.ib::after {
  content: "";
  position: absolute;
  inset: -2px;
}

.ib:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--ink);
}

.ib--blue {
  color: var(--blue);
}

.ib--blue:hover:not(:disabled) {
  background: var(--blue-wash);
  color: var(--blue);
}

.ib--danger:hover:not(:disabled) {
  background: var(--red-wash);
  color: var(--red-text);
}

.ib:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ib__tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  z-index: 20;
  transform: translate(-50%, 2px);
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--ink);
  color: var(--surface);
  font-size: var(--t-12);
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition:
    opacity var(--d-fast) var(--ease),
    transform var(--d-fast) var(--ease);
}

.ib:hover .ib__tip,
.ib:focus-visible .ib__tip {
  opacity: 1;
  transform: translate(-50%, 0);
  transition-delay: 350ms;
}

.ib:focus-visible .ib__tip {
  transition-delay: 0ms;
}

.ib__spin {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (hover: none) {
  .ib__tip {
    display: none;
  }
}
</style>
