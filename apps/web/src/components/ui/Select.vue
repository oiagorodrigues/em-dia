<script setup lang="ts" generic="V extends string | number">
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from "vue";
import { firstEnabled, moveActive, typeahead, type Option } from "@/lib/listbox.ts";
import { useMediaQuery } from "@/lib/media.ts";
import { layerFor } from "@/lib/layer.ts";
import { placeFloating } from "@/lib/position.ts";
import Icon from "./Icon.vue";

const model = defineModel<V | null>({ required: true });
const {
  options,
  label,
  id,
  name,
  placeholder = "Selecione",
  invalid = false,
  describedBy,
  disabled = false,
  native = false,
} = defineProps<{
  options: readonly Option<V>[];
  /** Accessible name when no <label for> points here (e.g. a toolbar filter). */
  label?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  /** Always use the native <select> (e.g. inside a form that must autofill). */
  native?: boolean;
}>();

/*
 * Touch screens get the native <select>: the OS picker is the most usable control on a phone.
 * Fine pointers get a listbox popover. The native element stays in the DOM in both cases,
 * so forms, autofill and assistive tech always have a real <select> to work with.
 */
const coarse = useMediaQuery("(pointer: coarse)", false);
const useNative = computed(() => native || coarse.value);

const listId = useId();
const buttonId = useId();
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const list = useTemplateRef<HTMLElement>("list");
const open = ref(false);
const active = ref(-1);
const layer = ref<HTMLElement | "body">("body");
const pos = ref({ top: -9999, left: -9999, width: 0, up: false });

const selectedIndex = computed(() => options.findIndex((o) => o.value === model.value));
const selected = computed(() => options[selectedIndex.value] ?? null);

/** The native select works with strings; map back to the option's own value type. */
const nativeValue = computed({
  get: () => (model.value === null ? "" : String(model.value)),
  set: (v: string) => {
    const opt = options.find((o) => String(o.value) === v);
    model.value = opt ? opt.value : null;
  },
});

function place(): void {
  const a = trigger.value?.getBoundingClientRect();
  const b = list.value?.getBoundingClientRect();
  if (!a || !b) return;
  const width = Math.max(a.width, 200);
  const p = placeFloating(
    a,
    { width, height: b.height },
    { width: window.innerWidth, height: window.innerHeight },
    "bottom",
    4,
    8,
    "start",
  );
  pos.value = { top: p.top, left: p.left, width, up: p.side === "top" };
}

async function show(at?: number): Promise<void> {
  if (disabled) return;
  active.value = at ?? (selectedIndex.value >= 0 ? selectedIndex.value : firstEnabled(options));
  layer.value = layerFor(trigger.value);
  open.value = true;
  await nextTick();
  place();
  list.value?.focus();
  scrollActiveIntoView();
}

function close(focusTrigger = true): void {
  if (!open.value) return;
  open.value = false;
  if (focusTrigger) trigger.value?.focus();
}

function choose(index: number): void {
  const o = options[index];
  if (!o || o.disabled) return;
  model.value = o.value;
  close();
}

function scrollActiveIntoView(): void {
  void nextTick(() => {
    list.value
      ?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
}

let buffer = "";
let bufferTimer: ReturnType<typeof setTimeout> | undefined;
function type(char: string): number {
  clearTimeout(bufferTimer);
  buffer += char;
  bufferTimer = setTimeout(() => (buffer = ""), 500);
  const from = open.value ? active.value : selectedIndex.value;
  return typeahead(options, buffer, from);
}

function onTriggerKey(e: KeyboardEvent): void {
  if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
    e.preventDefault();
    void show(e.key === "ArrowUp" ? firstEnabled(options, true) : undefined);
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Type-ahead on the closed control changes the value directly, like a native select.
    const i = type(e.key);
    if (i >= 0) model.value = options[i]!.value;
  }
}

function onListKey(e: KeyboardEvent): void {
  const handlers: Record<string, () => void> = {
    ArrowDown: () => (active.value = moveActive(options, active.value, 1)),
    ArrowUp: () => (active.value = moveActive(options, active.value, -1)),
    Home: () => (active.value = firstEnabled(options)),
    End: () => (active.value = firstEnabled(options, true)),
    Enter: () => choose(active.value),
    " ": () => choose(active.value),
    Escape: () => close(),
    Tab: () => close(false),
  };
  const run = handlers[e.key];
  if (run) {
    if (e.key !== "Tab") e.preventDefault();
    // Inside a <dialog>, Esc would also close the dialog; the listbox takes it first.
    if (e.key === "Escape") e.stopPropagation();
    run();
    scrollActiveIntoView();
    return;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const i = type(e.key);
    if (i >= 0) {
      active.value = i;
      scrollActiveIntoView();
    }
  }
}

function onDocPointer(e: Event): void {
  const t = e.target as Node;
  if (trigger.value?.contains(t) || list.value?.contains(t)) return;
  close(false);
}

function onViewport(): void {
  close(false);
}

watch(open, (isOpen) => {
  const m = isOpen ? "addEventListener" : "removeEventListener";
  document[m]("pointerdown", onDocPointer, true);
  window[m]("resize", onViewport);
  window[m]("scroll", onViewport, true);
});

onBeforeUnmount(() => {
  clearTimeout(bufferTimer);
  document.removeEventListener("pointerdown", onDocPointer, true);
  window.removeEventListener("resize", onViewport);
  window.removeEventListener("scroll", onViewport, true);
});
</script>

<template>
  <div class="sel" :class="{ 'is-invalid': invalid, 'is-native': useNative, 'is-open': open }">
    <select
      :id="useNative ? id : undefined"
      v-model="nativeValue"
      class="sel__native"
      :name="name"
      :disabled="disabled"
      :aria-label="useNative ? label : undefined"
      :aria-invalid="(useNative && invalid) || undefined"
      :aria-describedby="useNative ? describedBy : undefined"
      :tabindex="useNative ? undefined : -1"
      :aria-hidden="useNative ? undefined : 'true'"
    >
      <option v-if="selectedIndex < 0" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="o in options"
        :key="String(o.value)"
        :value="String(o.value)"
        :disabled="o.disabled"
      >
        {{ o.label }}
      </option>
    </select>

    <button
      v-if="!useNative"
      :id="id ?? buttonId"
      ref="trigger"
      type="button"
      class="sel__button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      :aria-label="label"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      :disabled="disabled"
      @click="open ? close() : show()"
      @keydown="onTriggerKey"
    >
      <span class="sel__value" :class="{ 'is-placeholder': !selected }">{{
        selected?.label ?? placeholder
      }}</span>
      <Icon name="chevron-down" :size="16" class="sel__chev" />
    </button>
    <Icon v-else name="chevron-down" :size="16" class="sel__chev sel__chev--native" />

    <Teleport :to="layer">
      <Transition name="sel-pop">
        <ul
          v-if="open"
          :id="listId"
          ref="list"
          class="sel__list"
          :class="{ 'is-up': pos.up }"
          role="listbox"
          tabindex="-1"
          :aria-labelledby="id ?? buttonId"
          :aria-activedescendant="active >= 0 ? `${listId}-${active}` : undefined"
          :style="{ top: `${pos.top}px`, left: `${pos.left}px`, minWidth: `${pos.width}px` }"
          @keydown="onListKey"
        >
          <li
            v-for="(o, i) in options"
            :id="`${listId}-${i}`"
            :key="String(o.value)"
            :data-index="i"
            role="option"
            class="sel__opt"
            :class="{ 'is-active': i === active, 'is-selected': o.value === model }"
            :aria-selected="o.value === model"
            :aria-disabled="o.disabled || undefined"
            @pointerenter="active = i"
            @click="choose(i)"
          >
            <span class="sel__opt-text">
              <span>{{ o.label }}</span>
              <span v-if="o.description" class="sel__desc">{{ o.description }}</span>
            </span>
            <Icon v-if="o.value === model" name="check" :size="16" class="sel__check" />
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.sel {
  position: relative;
  min-width: 0;
}

.sel__native,
.sel__button {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 calc(var(--s-3) + 24px) 0 var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  color: var(--ink);
  font-size: var(--t-14);
  text-align: left;
  transition:
    border-color var(--d-fast) var(--ease-out),
    box-shadow var(--d-fast) var(--ease-out);
  appearance: none;
}

.sel:not(.is-native) .sel__native {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

.sel__button:hover:not(:disabled),
.sel__native:hover:not(:disabled) {
  border-color: var(--ink-3);
}

.sel__button:focus-visible,
.sel.is-open .sel__button,
.sel__native:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-wash);
}

.sel.is-invalid .sel__button,
.sel.is-invalid .sel__native {
  border-color: var(--coral);
}

.sel__button:disabled,
.sel__native:disabled {
  background: var(--surface-2);
  color: var(--ink-3);
}

.sel__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sel__value.is-placeholder {
  color: var(--ink-3);
}

.sel__chev {
  position: absolute;
  right: var(--s-3);
  top: 50%;
  margin-top: -8px;
  color: var(--ink-2);
  pointer-events: none;
  transition: transform var(--d-fast) var(--ease-out);
}

.sel.is-open .sel__chev {
  transform: rotate(180deg);
}

.sel__list {
  position: fixed;
  z-index: 95;
  max-height: min(320px, 50vh);
  overflow-y: auto;
  padding: var(--s-1);
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-2);
  outline: none;
}

.sel__opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  min-height: 40px;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-1);
  font-size: var(--t-14);
  color: var(--ink);
  cursor: pointer;
}

.sel__opt.is-active {
  background: var(--surface-2);
}

.sel__opt.is-selected {
  font-weight: 600;
}

.sel__opt[aria-disabled="true"] {
  color: var(--ink-3);
  cursor: not-allowed;
}

.sel__opt-text {
  display: grid;
  gap: 2px;
}

.sel__desc {
  font-size: var(--t-12);
  color: var(--ink-2);
  font-weight: 400;
}

.sel__check {
  color: var(--brand);
  flex: none;
}

.sel-pop-enter-active {
  transition:
    opacity var(--d-fast) var(--ease-out),
    transform var(--d-fast) var(--ease-out);
}

.sel-pop-leave-active {
  transition: opacity 80ms var(--ease-in);
}

.sel-pop-enter-from,
.sel-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.sel-pop-enter-from.is-up {
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .sel-pop-enter-from {
    transform: none;
  }
}
</style>
