<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import Icon from "./Icon.vue";
import type { IconName } from "./icons.ts";
import Tooltip from "./Tooltip.vue";

const {
  variant = "secondary",
  type = "button",
  to,
  href,
  loading = false,
  disabled = false,
  block = false,
  icon,
  iconRight,
  download,
  label,
  iconOnly = false,
} = defineProps<{
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  to?: RouteLocationRaw;
  href?: string;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  /** With `href`: save the target under this filename instead of opening it. */
  download?: string;
  /** Accessible name and tooltip text; required with `iconOnly`. */
  label?: string;
  /**
   * Hide the text where a hover tooltip can stand in for it (`md`+ with a mouse); phones and
   * touch screens keep the text, since they have no hover to reveal the tooltip.
   */
  iconOnly?: boolean;
}>();

// With `iconOnly` the root is the Tooltip wrapper; attrs and listeners belong on the button.
defineOptions({ inheritAttrs: false });

const compact = computed(() => (iconOnly && label && icon ? { label, icon } : null));

const tag = computed(() => (to ? RouterLink : href ? "a" : "button"));
const attrs = computed(() => {
  if (to) return { to };
  if (href && download) return { href, download };
  if (href) return { href, target: "_blank", rel: "noopener noreferrer" };
  return { type, disabled: disabled || loading };
});
</script>

<template>
  <Tooltip v-if="compact" :text="compact.label">
    <component
      :is="tag"
      v-bind="{ ...$attrs, ...attrs }"
      class="btn btn--icon-only"
      :class="[`btn--${variant}`, { 'is-loading': loading }]"
      :aria-label="label"
      :aria-busy="loading || undefined"
    >
      <span v-if="loading" class="btn__spinner" aria-hidden="true" />
      <Icon v-else :name="compact.icon" :size="20" />
      <span class="btn__label"
        ><slot>{{ label }}</slot></span
      >
    </component>
  </Tooltip>
  <component
    :is="tag"
    v-else
    v-bind="{ ...$attrs, ...attrs }"
    class="btn"
    :class="[`btn--${variant}`, { 'btn--block': block, 'is-loading': loading }]"
    :aria-label="label"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <Icon v-else-if="icon" :name="icon" :size="18" />
    <span class="btn__label"><slot /></span>
    <Icon v-if="iconRight && !loading" :name="iconRight" :size="18" />
  </component>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: 0 var(--s-5);
  border-radius: var(--r-1);
  font-weight: 600;
  font-size: var(--t-16);
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  user-select: none;
  transition:
    transform var(--d-fast) var(--ease),
    box-shadow var(--d-fast) var(--ease),
    background-color var(--d-fast) var(--ease),
    color var(--d-fast) var(--ease),
    border-color var(--d-fast) var(--ease);
}

.btn--block {
  display: flex;
  width: 100%;
}

.btn--primary {
  background: var(--brand);
  color: var(--on-ink);
  border: 1px solid var(--brand);
  box-shadow: var(--shadow-1);
}

.btn--primary:hover:not(:disabled) {
  background: var(--brand-strong);
  border-color: var(--brand-strong);
  box-shadow: var(--shadow-2);
}

.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn--secondary {
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--rule);
  box-shadow: var(--shadow-1);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--ink-3);
}

.btn--ghost {
  color: var(--brand);
  padding: 0 var(--s-3);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--brand-wash);
}

.btn--danger {
  color: var(--coral-ink);
  border: 1px solid currentColor;
  background: transparent;
}

.btn--danger:hover:not(:disabled) {
  background: var(--coral-wash);
}

.btn:disabled {
  opacity: 0.5;
}

.btn.is-loading {
  cursor: progress;
  opacity: 1;
}

.btn__label {
  display: inline-flex;
  align-items: center;
}

@media (min-width: 640px) and (hover: hover) {
  .btn--icon-only {
    width: 44px;
    padding: 0;
  }

  .btn--icon-only .btn__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

.btn__spinner {
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
  .btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
