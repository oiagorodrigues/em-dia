<script setup lang="ts">
import { parseMoneyToCents } from "@ponto/shared";
import { computed } from "vue";

const MAX_CENTS = 100_000_000;

const model = defineModel<number | null>({ required: true });
const {
  id,
  invalid = false,
  describedBy,
  placeholder = "0,00",
  autofocus = false,
} = defineProps<{
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  autofocus?: boolean;
}>();

const plain = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const display = computed(() => (model.value === null ? "" : plain.format(model.value / 100)));

function fromDigits(raw: string): number | null {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  return Math.min(Number(digits), MAX_CENTS);
}

function onInput(e: Event): void {
  const el = e.target as HTMLInputElement;
  model.value = fromDigits(el.value);
  // Re-sync even when the model didn't change (e.g. a letter was typed), and keep the caret at the end
  // because digits always shift in from the right.
  el.value = display.value;
  el.setSelectionRange(el.value.length, el.value.length);
}

/** A pasted "1.234,56" or "150" means reais, not shifted cents. */
function onPaste(e: ClipboardEvent): void {
  const text = e.clipboardData?.getData("text") ?? "";
  const cents = parseMoneyToCents(text.trim());
  if (cents === null) return;
  e.preventDefault();
  model.value = Math.min(cents, MAX_CENTS);
}
</script>

<template>
  <div class="money" :class="{ 'is-invalid': invalid }">
    <span class="money__prefix mono" aria-hidden="true">R$</span>
    <input
      :id="id"
      class="input input--mono money__input"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :value="display"
      :placeholder="placeholder"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
      :autofocus="autofocus"
      @input="onInput"
      @paste="onPaste"
    />
  </div>
</template>

<style scoped>
.money {
  position: relative;
}

.money__prefix {
  position: absolute;
  left: var(--s-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-2);
  font-size: var(--t-14);
  pointer-events: none;
}

.money__input {
  padding-left: calc(var(--s-3) + 2.4em);
  font-size: var(--t-20);
  text-align: left;
}
</style>
