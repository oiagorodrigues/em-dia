<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import Icon from "./Icon.vue";
import type { IconName } from "./icons.ts";
import type { MenuItem } from "./menu.ts";

const {
  items,
  label = "Mais ações",
  icon = "more",
  align = "end",
} = defineProps<{
  items: readonly MenuItem[];
  /** Accessible name of the trigger. */
  label?: string;
  icon?: IconName;
  align?: "start" | "end";
}>();

const open = ref(false);
const up = ref(false);
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

async function show(focusIndex = 0): Promise<void> {
  // Open upwards when the trigger sits near the bottom of the viewport (last table rows).
  const rect = trigger.value?.getBoundingClientRect();
  up.value = !!rect && window.innerHeight - rect.bottom < 48 * items.length + 24;
  open.value = true;
  await nextTick();
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
  run();
}

function onDocPointer(e: PointerEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) close(false);
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener("pointerdown", onDocPointer, true);
  else document.removeEventListener("pointerdown", onDocPointer, true);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocPointer, true));
</script>

<template>
  <div ref="root" class="menu">
    <button
      ref="trigger"
      type="button"
      class="menu__trigger"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? id : undefined"
      @click.stop="toggle"
      @keydown="onTriggerKey"
    >
      <Icon :name="icon" :size="18" />
    </button>
    <Transition name="menu">
      <ul
        v-if="open"
        :id="id"
        ref="list"
        class="menu__list"
        :class="[`menu__list--${align}`, { 'is-up': up }]"
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

.menu__list {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 30;
  min-width: 200px;
  padding: var(--s-1);
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  box-shadow: var(--shadow-2);
}

.menu__list--end {
  right: 0;
}

.menu__list--start {
  left: 0;
}

.menu__list.is-up {
  top: auto;
  bottom: calc(100% + 4px);
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
  box-shadow: inset 0 0 0 2px var(--blue);
}

.menu__item.is-danger {
  color: var(--red-text);
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

@media (prefers-reduced-motion: reduce) {
  .menu-enter-from,
  .menu-leave-to {
    transform: none;
  }
}
</style>
