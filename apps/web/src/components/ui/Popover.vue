<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { layerFor } from "@/lib/layer.ts";
import { placeFloating } from "@/lib/position.ts";

const open = defineModel<boolean>("open", { required: true });
const {
  anchor,
  label,
  align = "start",
  width,
} = defineProps<{
  /** Element the popover hangs from (positioning and outside-click). */
  anchor: HTMLElement | null;
  label: string;
  align?: "start" | "center" | "end";
  width?: number;
}>();

const panel = useTemplateRef<HTMLElement>("panel");
const pos = ref({ top: -9999, left: -9999, up: false });
const layer = ref<HTMLElement | "body">("body");

async function place(): Promise<void> {
  await nextTick();
  const a = anchor?.getBoundingClientRect();
  const b = panel.value?.getBoundingClientRect();
  if (!a || !b) return;
  const p = placeFloating(
    a,
    { width: width ?? b.width, height: b.height },
    { width: window.innerWidth, height: window.innerHeight },
    "bottom",
    6,
    8,
    align,
  );
  pos.value = { top: p.top, left: p.left, up: p.side === "top" };
}

function onDocPointer(e: Event): void {
  const t = e.target as Node;
  if (anchor?.contains(t) || panel.value?.contains(t)) return;
  open.value = false;
}

function onKey(e: Event): void {
  if ((e as KeyboardEvent).key === "Escape") {
    // Close the popover, not the dialog it may sit in.
    e.preventDefault();
    e.stopPropagation();
    open.value = false;
    anchor?.querySelector<HTMLElement>("input, button")?.focus();
  }
}

function onResize(): void {
  open.value = false;
}

watch(
  open,
  (isOpen) => {
    if (isOpen) layer.value = layerFor(anchor);
  },
  { flush: "pre" },
);

watch(open, (isOpen) => {
  const m = isOpen ? "addEventListener" : "removeEventListener";
  document[m]("pointerdown", onDocPointer, true);
  // Capture phase: runs before the dialog's own Esc handling.
  document[m]("keydown", onKey, true);
  window[m]("resize", onResize);
  if (isOpen) void place();
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", onResize);
});

defineExpose({ place });
</script>

<template>
  <Teleport :to="layer">
    <Transition name="pop">
      <div
        v-if="open"
        ref="panel"
        class="pop"
        :class="{ 'is-up': pos.up }"
        role="dialog"
        :aria-label="label"
        :style="{
          top: `${pos.top}px`,
          left: `${pos.left}px`,
          width: width ? `${width}px` : undefined,
        }"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pop {
  position: fixed;
  z-index: 95;
  padding: var(--s-2);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-2);
}

.pop-enter-active {
  transition:
    opacity var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out);
}

.pop-leave-active {
  transition: opacity 80ms var(--ease-in);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.pop-enter-from.is-up {
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .pop-enter-from {
    transform: none;
  }
}
</style>
