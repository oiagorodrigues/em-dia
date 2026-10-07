<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useMediaQuery } from "@/lib/media.ts";
import { maskTime, nearestSlot, normalizeTime, timeSlots } from "@/lib/timeinput.ts";
import Button from "./Button.vue";
import Icon from "./Icon.vue";
import Popover from "./Popover.vue";
import Sheet from "./Sheet.vue";

/** "HH:MM", or "" when empty. */
const model = defineModel<string>({ required: true });
const {
  id,
  invalid = false,
  describedBy,
  disabled = false,
  step = 15,
  label = "Horário",
  placeholder = "--:--",
} = defineProps<{
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  /** Minutes between suggested slots. */
  step?: number;
  /** Names the picker dialog. */
  label?: string;
  placeholder?: string;
}>();

const coarse = useMediaQuery("(pointer: coarse)", false);
const wrap = useTemplateRef<HTMLElement>("wrap");
const slotList = useTemplateRef<HTMLElement>("slotList");
const text = ref(model.value);
const open = ref(false);

watch(model, (v) => {
  if (normalizeTime(text.value) !== v) text.value = v;
});

function onInput(e: Event): void {
  const el = e.target as HTMLInputElement;
  text.value = maskTime(el.value);
  el.value = text.value;
  // A complete HH:MM goes out right away; partial input waits for blur.
  if (text.value.length === 5) {
    const t = normalizeTime(text.value);
    if (t) model.value = t;
  }
}

function commit(): void {
  if (!text.value.trim()) {
    model.value = "";
    return;
  }
  const t = normalizeTime(text.value);
  if (t) {
    model.value = t;
    text.value = t;
  } else {
    // Leave the typed text so the field can show it as invalid; the form validates.
    model.value = text.value;
  }
}

const slots = computed(() => timeSlots(step));
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const wheelHour = ref("08");
const wheelMinute = ref("00");

async function openPicker(): Promise<void> {
  if (disabled) return;
  const current = normalizeTime(model.value);
  if (coarse.value) {
    wheelHour.value = current?.slice(0, 2) ?? "08";
    const m = Number(current?.slice(3) ?? 0);
    wheelMinute.value = String(Math.min(55, Math.round(m / 5) * 5)).padStart(2, "0");
  }
  open.value = true;
  if (!coarse.value) {
    await nextTick();
    await nextTick();
    const i = nearestSlot(slots.value, current);
    slotList.value
      ?.querySelector<HTMLElement>(`[data-i="${i}"]`)
      ?.scrollIntoView({ block: "center" });
    slotList.value?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.focus();
  }
}

function pick(t: string): void {
  model.value = t;
  text.value = t;
  open.value = false;
  wrap.value?.querySelector("input")?.focus();
}

function onSlotKey(e: KeyboardEvent, i: number): void {
  const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
  if (!delta) return;
  e.preventDefault();
  slotList.value?.querySelector<HTMLElement>(`[data-i="${i + delta}"]`)?.focus();
}
</script>

<template>
  <div ref="wrap" class="tf" :class="{ 'is-invalid': invalid, 'is-disabled': disabled }">
    <input
      :id="id"
      class="input tf__input mono"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      maxlength="5"
      :placeholder="placeholder"
      :value="text"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      @input="onInput"
      @blur="commit"
      @keydown.enter.prevent="commit"
    />
    <button
      type="button"
      class="tf__btn"
      :aria-label="`Escolher ${label.toLowerCase()}`"
      :aria-expanded="open"
      :disabled="disabled"
      @click="open ? (open = false) : openPicker()"
    >
      <Icon name="clock" :size="18" />
    </button>

    <Popover v-if="!coarse" v-model:open="open" :anchor="wrap" :label="label" :width="140">
      <ul ref="slotList" class="tf__slots" role="listbox" :aria-label="label">
        <li v-for="(s, i) in slots" :key="s" role="none">
          <button
            type="button"
            role="option"
            class="tf__slot mono"
            :class="{ 'is-on': s === model }"
            :aria-selected="s === model"
            :data-i="i"
            @click="pick(s)"
            @keydown="onSlotKey($event, i)"
          >
            {{ s }}
          </button>
        </li>
      </ul>
    </Popover>

    <Sheet v-else v-model:open="open" :title="label">
      <div class="tf__wheels">
        <div class="tf__col" role="listbox" aria-label="Hora">
          <button
            v-for="h in HOURS"
            :key="h"
            type="button"
            role="option"
            class="tf__cell mono"
            :class="{ 'is-on': h === wheelHour }"
            :aria-selected="h === wheelHour"
            @click="wheelHour = h"
          >
            {{ h }}
          </button>
        </div>
        <span class="tf__sep mono" aria-hidden="true">:</span>
        <div class="tf__col" role="listbox" aria-label="Minuto">
          <button
            v-for="m in MINUTES"
            :key="m"
            type="button"
            role="option"
            class="tf__cell mono"
            :class="{ 'is-on': m === wheelMinute }"
            :aria-selected="m === wheelMinute"
            @click="wheelMinute = m"
          >
            {{ m }}
          </button>
        </div>
      </div>
      <template #footer>
        <Button @click="open = false">Cancelar</Button>
        <Button variant="primary" @click="pick(`${wheelHour}:${wheelMinute}`)"
          >Usar {{ wheelHour }}:{{ wheelMinute }}</Button
        >
      </template>
    </Sheet>
  </div>
</template>

<style scoped>
.tf {
  position: relative;
}

.tf__input {
  padding-right: 48px;
  letter-spacing: 0.04em;
}

.tf__btn {
  position: absolute;
  right: 2px;
  top: 2px;
  bottom: 2px;
  width: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--r-1);
  color: var(--ink-2);
  transition:
    background-color var(--d-fast) var(--ease-out),
    color var(--d-fast) var(--ease-out);
}

.tf__btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--ink);
}

.tf__slots {
  list-style: none;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  display: grid;
  gap: 2px;
}

.tf__slot {
  width: 100%;
  min-height: 36px;
  border-radius: var(--r-1);
  font-size: var(--t-14);
  color: var(--ink);
}

.tf__slot:hover,
.tf__slot:focus-visible {
  background: var(--surface-2);
  outline: none;
}

.tf__slot.is-on {
  background: var(--brand-wash);
  color: var(--brand-ink);
  font-weight: 600;
}

.tf__wheels {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--s-3);
}

.tf__col {
  display: grid;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  padding: var(--s-1);
  border-radius: var(--r-2);
  background: var(--surface-2);
}

.tf__cell {
  min-height: 44px;
  scroll-snap-align: center;
  border-radius: var(--r-1);
  font-size: var(--t-20);
  color: var(--ink-2);
}

.tf__cell.is-on {
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
  box-shadow: var(--shadow-1);
}

.tf__sep {
  font-size: var(--t-28);
  color: var(--ink-2);
}
</style>
