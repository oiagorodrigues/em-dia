<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef } from "vue";
import { layerFor } from "@/lib/layer.ts";
import { placeFloating, type Side } from "@/lib/position.ts";
import { TOOLTIP_DELAY, tooltipWarm } from "./tooltip.ts";

const {
  text,
  side = "top",
  delay = TOOLTIP_DELAY,
  describes = false,
  disabled = false,
} = defineProps<{
  text: string;
  side?: Side;
  /** Hover delay in ms; keyboard focus always shows it right away. */
  delay?: number;
  /** Link the tooltip to the trigger with aria-describedby (off when it repeats the aria-label). */
  describes?: boolean;
  disabled?: boolean;
}>();

const id = useId();
const anchor = useTemplateRef<HTMLElement>("anchor");
const bubble = useTemplateRef<HTMLElement>("bubble");
const open = ref(false);
const pos = ref({ top: -9999, left: -9999, side: side as Side });
const layer = ref<HTMLElement | "body">("body");
let timer: ReturnType<typeof setTimeout> | undefined;

async function place(): Promise<void> {
  await nextTick();
  const a = anchor.value?.getBoundingClientRect();
  const b = bubble.value?.getBoundingClientRect();
  if (!a || !b) return;
  pos.value = placeFloating(a, b, { width: window.innerWidth, height: window.innerHeight }, side);
}

function show(immediate = false): void {
  clearTimeout(timer);
  if (disabled) return;
  timer = setTimeout(
    () => {
      layer.value = layerFor(anchor.value);
      open.value = true;
      void place();
      window.addEventListener("scroll", hide, { capture: true, passive: true });
      window.addEventListener("keydown", onKey);
    },
    immediate || tooltipWarm.isWarm() ? 0 : delay,
  );
}

function hide(): void {
  clearTimeout(timer);
  if (open.value) tooltipWarm.cool();
  open.value = false;
  window.removeEventListener("scroll", hide, { capture: true });
  window.removeEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") hide();
}

function onFocusIn(e: FocusEvent): void {
  // Only keyboard focus shows it right away; a click that focuses waits like hover.
  if ((e.target as HTMLElement).matches?.(":focus-visible")) show(true);
}

onBeforeUnmount(hide);
</script>

<template>
  <span
    ref="anchor"
    class="tip-anchor"
    :aria-describedby="describes && open ? id : undefined"
    @mouseenter="show()"
    @mouseleave="hide"
    @focusin="onFocusIn"
    @focusout="hide"
    @pointerdown="hide"
  >
    <slot />
  </span>
  <Teleport :to="layer">
    <Transition name="tip">
      <div
        v-if="open"
        :id="id"
        ref="bubble"
        class="tip"
        :class="`is-${pos.side}`"
        role="tooltip"
        :aria-hidden="describes ? undefined : 'true'"
        :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
      >
        {{ text }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tip-anchor {
  display: inline-flex;
}

.tip {
  position: fixed;
  z-index: 100;
  max-width: 240px;
  padding: 6px 10px;
  border-radius: var(--r-1);
  background: var(--ink);
  color: var(--surface);
  font-size: var(--t-12);
  font-weight: 600;
  line-height: 1.35;
  pointer-events: none;
  box-shadow: var(--shadow-2);
}

.tip-enter-active {
  transition:
    opacity var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out);
}

.tip-leave-active {
  transition: opacity 80ms var(--ease-in);
}

.tip-enter-from,
.tip-leave-to {
  opacity: 0;
}

.tip-enter-from.is-top {
  transform: translateY(4px);
}

.tip-enter-from.is-bottom {
  transform: translateY(-4px);
}

.tip-enter-from.is-right {
  transform: translateX(-4px);
}

@media (hover: none) {
  .tip {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tip-enter-from.is-top,
  .tip-enter-from.is-bottom,
  .tip-enter-from.is-right {
    transform: none;
  }
}
</style>
