<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import Icon from "./Icon.vue";
import type { IconName } from "./icons.ts";
import Tooltip from "./Tooltip.vue";

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
  /** Inline actions are colored by meaning: brand (bater entrada, pagar), amber (bater saída), coral (remover). */
  tone?: "neutral" | "brand" | "amber" | "coral";
  disabled?: boolean;
  loading?: boolean;
  tooltip?: boolean;
}>();

// The root may be the Tooltip wrapper; listeners and attrs (e.g. @click) belong on the button.
defineOptions({ inheritAttrs: false });

const tag = computed(() => (to ? RouterLink : href ? "a" : "button"));
const attrs = computed(() => {
  if (to) return { to };
  if (href) return { href, target: "_blank", rel: "noopener noreferrer" };
  return { type: "button", disabled: disabled || loading };
});
</script>

<template>
  <Tooltip v-if="tooltip" :text="label">
    <component
      :is="tag"
      v-bind="{ ...$attrs, ...attrs }"
      class="ib"
      :class="[`ib--${tone}`, { 'is-loading': loading }]"
      :aria-label="label"
      :aria-busy="loading || undefined"
    >
      <span v-if="loading" class="ib__spin" aria-hidden="true" />
      <Icon v-else :name="icon" :size="18" />
    </component>
  </Tooltip>
  <component
    :is="tag"
    v-else
    v-bind="{ ...$attrs, ...attrs }"
    class="ib"
    :class="[`ib--${tone}`, { 'is-loading': loading }]"
    :aria-label="label"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="ib__spin" aria-hidden="true" />
    <Icon v-else :name="icon" :size="18" />
  </component>
</template>

<style scoped>
.ib {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: var(--ink-2);
  text-decoration: none;
  transition:
    background-color var(--d-fast) var(--ease-out),
    color var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out);
}

/* 40px visible, 44px hit area */
.ib::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 50%;
}

.ib:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--ink);
}

.ib:active:not(:disabled) {
  transform: scale(0.94);
}

.ib--brand {
  color: var(--brand);
}

.ib--brand:hover:not(:disabled) {
  background: var(--brand-wash);
  color: var(--brand-ink);
}

.ib--amber {
  color: var(--amber);
}

.ib--amber:hover:not(:disabled) {
  background: var(--amber-wash);
  color: var(--amber-ink);
}

.ib--coral {
  color: var(--coral);
}

.ib--coral:hover:not(:disabled) {
  background: var(--coral-wash);
  color: var(--coral-ink);
}

.ib:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ib:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
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

@media (prefers-reduced-motion: reduce) {
  .ib:active:not(:disabled) {
    transform: none;
  }
}
</style>
