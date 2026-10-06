<script setup lang="ts">
import { DEFAULT_TIMEZONE, isValidIsoDate, nowInZone, toYearMonth } from "@emdia/shared";
import { ref, useTemplateRef, watch } from "vue";
import { inRange, isoToBr, maskDate, parseBrDate } from "@/lib/dateinput.ts";
import { useMediaQuery } from "@/lib/media.ts";
import CalendarGrid from "./CalendarGrid.vue";
import Icon from "./Icon.vue";
import Popover from "./Popover.vue";
import Sheet from "./Sheet.vue";

/** ISO "YYYY-MM-DD", or "" when empty. */
const model = defineModel<string>({ required: true });
const {
  id,
  invalid = false,
  describedBy,
  disabled = false,
  min,
  max,
  label = "Data",
} = defineProps<{
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  min?: string | null;
  max?: string | null;
  label?: string;
}>();

const coarse = useMediaQuery("(pointer: coarse)", false);
const wrap = useTemplateRef<HTMLElement>("wrap");
const text = ref(isoToBr(model.value));
const open = ref(false);
const today = nowInZone(DEFAULT_TIMEZONE).date;
const shown = ref(toYearMonth(model.value || today));

watch(model, (v) => {
  // Only reformat real dates; leave whatever the person is typing alone.
  if ((v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v)) && parseBrDate(text.value) !== v)
    text.value = isoToBr(v);
});

function onInput(e: Event): void {
  const el = e.target as HTMLInputElement;
  // Pasted ISO dates ("2026-10-06", e.g. from a spreadsheet or a test) are accepted as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(el.value.trim()) && isValidIsoDate(el.value.trim())) {
    model.value = el.value.trim();
    text.value = isoToBr(model.value);
    el.value = text.value;
    return;
  }
  text.value = maskDate(el.value);
  el.value = text.value;
  const iso = parseBrDate(text.value);
  if (iso) model.value = iso;
}

function commit(): void {
  if (!text.value.trim()) {
    model.value = "";
    return;
  }
  const iso = parseBrDate(text.value);
  // An unreadable date is passed through as typed so the form's schema flags it.
  model.value = iso ?? text.value;
}

function openPicker(): void {
  if (disabled) return;
  shown.value = toYearMonth(parseBrDate(text.value) ?? today);
  open.value = true;
}

function pick(date: string): void {
  if (!inRange(date, min, max)) return;
  model.value = date;
  text.value = isoToBr(date);
  open.value = false;
  wrap.value?.querySelector("input")?.focus();
}
</script>

<template>
  <div ref="wrap" class="df" :class="{ 'is-invalid': invalid }">
    <input
      :id="id"
      class="input df__input mono"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder="DD/MM/AAAA"
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
      class="df__btn"
      :aria-label="`Abrir calendário: ${label.toLowerCase()}`"
      :aria-expanded="open"
      :disabled="disabled"
      @click="open ? (open = false) : openPicker()"
    >
      <Icon name="calendar" :size="18" />
    </button>

    <Popover v-if="!coarse" v-model:open="open" :anchor="wrap" :label="label" :width="300">
      <CalendarGrid
        v-model:month="shown"
        :value="model"
        :today="today"
        :min="min"
        :max="max"
        @pick="pick"
      />
    </Popover>
    <Sheet v-else v-model:open="open" :title="label">
      <CalendarGrid
        v-model:month="shown"
        :value="model"
        :today="today"
        :min="min"
        :max="max"
        @pick="pick"
      />
    </Sheet>
  </div>
</template>

<style scoped>
.df {
  position: relative;
}

.df__input {
  padding-right: 48px;
}

.df__btn {
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

.df__btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--ink);
}
</style>
