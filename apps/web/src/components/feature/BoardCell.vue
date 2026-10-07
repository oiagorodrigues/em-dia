<script setup lang="ts">
import type { BoardCellKind } from "@/lib/board.ts";

const {
  kind,
  label,
  tip,
  today = false,
  focusable = false,
  action = false,
} = defineProps<{
  kind: BoardCellKind;
  label: string;
  tip?: string;
  today?: boolean;
  /** Roving focus inside the board: reachable by arrow keys, not by Tab. */
  focusable?: boolean;
  /** Enter, Space or a click opens the day; the parent handles them. */
  action?: boolean;
}>();
</script>

<template>
  <span
    class="bcell"
    :class="[`is-${kind}`, { 'is-today': today, 'is-action': action }]"
    :role="action ? 'button' : 'img'"
    :aria-label="label"
    :data-tip="tip"
    :tabindex="focusable ? -1 : undefined"
  />
</template>

<style scoped>
.bcell {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  transition: transform var(--d-fast) var(--ease);
}

.bcell.is-worked {
  background: color-mix(in srgb, var(--brand-ink) 38%, var(--brand-wash));
  border-color: color-mix(in srgb, var(--brand-ink) 45%, transparent);
}

.bcell.is-absent {
  background: var(--coral);
  border-color: var(--coral);
}

.bcell.is-soft {
  background: color-mix(in srgb, var(--amber-ink) 22%, var(--amber-wash));
  border-color: color-mix(in srgb, var(--amber-ink) 40%, transparent);
}

.bcell.is-missing {
  border: 1.5px dashed var(--ink-3);
}

.bcell.is-none {
  background: color-mix(in srgb, var(--surface-2) 70%, transparent);
}

.bcell.is-planned::before {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-3);
  opacity: 0.7;
}

.bcell.is-action {
  cursor: pointer;
}

.bcell.is-today {
  box-shadow: 0 0 0 2px var(--brand);
}

.bcell:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  transform: scale(1.12);
  z-index: 2;
}

.bcell[data-tip]:hover::after,
.bcell[data-tip]:focus-visible::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--ink);
  color: var(--surface);
  font-family: var(--font-mono);
  font-size: 11px;
  font-stretch: 87.5%;
  white-space: nowrap;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .bcell:focus-visible {
    transform: none;
  }
}
</style>
