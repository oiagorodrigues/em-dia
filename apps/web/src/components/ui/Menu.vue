<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import Icon from "./Icon.vue";
import type { IconName } from "./icons.ts";
import { layerFor } from "@/lib/layer.ts";
import { placeFloating } from "@/lib/position.ts";
import type { MenuItem } from "./menu.ts";

const {
  items,
  label = "Mais ações",
  icon = "more",
  align = "end",
  text,
  loading = false,
} = defineProps<{
  items: readonly MenuItem[];
  /** Accessible name of the trigger, and of the list. */
  label?: string;
  icon?: IconName;
  align?: "start" | "end";
  /** Visible trigger text: the trigger becomes a secondary button with a chevron. */
  text?: string;
  /** With `text`: spinner in place of the icon while the chosen action runs. */
  loading?: boolean;
}>();

const open = ref(false);
const up = ref(false);
const pos = ref({ top: -9999, left: -9999 });
const layer = ref<HTMLElement | "body">("body");
const active = ref(0);
const id = useId();
const root = useTemplateRef<HTMLElement>("root");
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const list = useTemplateRef<HTMLElement>("list");

function itemEls(): HTMLElement[] {
  return [...(list.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

function focusItem(index: number): void {
  const els = itemEls();
  if (els.length === 0) return;
  active.value = (index + els.length) % els.length;
  els[active.value]?.focus();
}

/** The list lives on <body> so table scroll containers never clip it; place it by the trigger. */
function place(): void {
  const a = trigger.value?.getBoundingClientRect();
  const b = list.value?.getBoundingClientRect();
  if (!a || !b) return;
  const p = placeFloating(
    a,
    b,
    { width: window.innerWidth, height: window.innerHeight },
    "bottom",
    4,
    8,
    align,
  );
  up.value = p.side === "top";
  pos.value = { top: p.top, left: p.left };
}

async function show(focusIndex = 0): Promise<void> {
  layer.value = layerFor(trigger.value);
  open.value = true;
  await nextTick();
  place();
  focusItem(focusIndex);
}

function close(returnFocus = true): void {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) trigger.value?.focus();
}

function toggle(): void {
  if (open.value) close();
  else void show();
}

function select(item: MenuItem): void {
  if (item.disabled) return;
  close();
  item.onSelect();
}

function onTriggerKey(e: KeyboardEvent): void {
  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    void show(0);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    void show(items.length - 1);
  }
}

function onMenuKey(e: KeyboardEvent): void {
  const keys: Record<string, () => void> = {
    ArrowDown: () => focusItem(active.value + 1),
    ArrowUp: () => focusItem(active.value - 1),
    Home: () => focusItem(0),
    End: () => focusItem(items.length - 1),
    Escape: () => close(),
    Tab: () => close(false),
  };
  const run = keys[e.key];
  if (!run) return;
  if (e.key !== "Tab") e.preventDefault();
  if (e.key === "Escape") e.stopPropagation();
  run();
}

function onDocPointer(e: Event): void {
  const target = e.target as Node;
  if (root.value?.contains(target) || list.value?.contains(target)) return;
  close(false);
}

function onViewportChange(): void {
  close(false);
}

watch(open, (isOpen) => {
  const method = isOpen ? "addEventListener" : "removeEventListener";
  document[method]("pointerdown", onDocPointer, true);
  window[method]("scroll", onViewportChange, true);
  window[method]("resize", onViewportChange);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
  window.removeEventListener("scroll", onViewportChange, true);
  window.removeEventListener("resize", onViewportChange);
});
</script>

<template>
  <div ref="root" class="menu">
    <button
      ref="trigger"
      type="button"
      class="menu__trigger"
      :class="{ 'menu__trigger--text': text }"
      :aria-label="text ? undefined : label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? id : undefined"
      :aria-busy="loading || undefined"
      :disabled="loading"
      @click.stop="toggle"
      @keydown="onTriggerKey"
    >
      <template v-if="text">
        <span v-if="loading" class="menu__spinner" aria-hidden="true" />
        <Icon v-else :name="icon" :size="18" />
        <span>{{ text }}</span>
        <Icon name="chevron-down" :size="16" />
      </template>
      <Icon v-else :name="icon" :size="18" />
    </button>
    <Teleport :to="layer">
      <Transition name="menu">
        <ul
          v-if="open"
          :id="id"
          ref="list"
          class="menu__list"
          :class="{ 'is-up': up }"
          :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
          role="menu"
          :aria-label="label"
          @keydown="onMenuKey"
          @click.stop
        >
          <li v-for="(item, i) in items" :key="item.label" role="none">
            <button
              type="button"
              role="menuitem"
              class="menu__item"
              :class="{ 'is-danger': item.danger }"
              :tabindex="i === active ? 0 : -1"
              :aria-disabled="item.disabled || undefined"
              @click="select(item)"
            >
              <Icon v-if="item.icon" :name="item.icon" :size="16" />
              <span>{{ item.label }}</span>
            </button>
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
  display: inline-block;
}

.menu__trigger {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--r-1);
  color: var(--ink-2);
}

.menu__trigger:hover,
.menu__trigger[aria-expanded="true"] {
  background: var(--surface-2);
  color: var(--ink);
}

.menu__trigger--text {
  display: inline-flex;
  gap: var(--s-2);
  width: auto;
  height: auto;
  min-height: 44px;
  padding: 0 var(--s-4) 0 var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  box-shadow: var(--shadow-1);
  font-weight: 600;
  font-size: var(--t-16);
  line-height: 1;
  white-space: nowrap;
  color: var(--ink);
}

.menu__trigger--text:hover,
.menu__trigger--text[aria-expanded="true"] {
  border-color: var(--ink-3);
}

.menu__trigger:disabled {
  cursor: progress;
}

.menu__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: menu-spin 0.7s linear infinite;
}

@keyframes menu-spin {
  to {
    transform: rotate(360deg);
  }
}

.menu__list {
  position: fixed;
  z-index: 90;
  min-width: 200px;
  padding: var(--s-1);
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  box-shadow: var(--shadow-2);
}

.menu__item {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  width: 100%;
  min-height: 40px;
  padding: 0 var(--s-3);
  border-radius: 6px;
  font-size: var(--t-14);
  font-weight: 500;
  text-align: left;
  color: var(--ink);
  white-space: nowrap;
}

.menu__item:hover,
.menu__item:focus-visible {
  background: var(--surface-2);
  outline: none;
}

.menu__item:focus-visible {
  box-shadow: inset 0 0 0 2px var(--brand);
}

.menu__item.is-danger {
  color: var(--coral-ink);
}

.menu__item[aria-disabled="true"] {
  opacity: 0.45;
  cursor: not-allowed;
}

.menu-enter-active,
.menu-leave-active {
  transition:
    opacity var(--d-fast) var(--ease),
    transform var(--d-fast) var(--ease);
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.menu-enter-from.is-up,
.menu-leave-to.is-up {
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .menu-enter-from,
  .menu-leave-to {
    transform: none;
  }
}
</style>
