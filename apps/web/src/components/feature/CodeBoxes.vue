<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { INVITE_LENGTH, normalizeInviteCode } from "@/lib/invite.ts";

const model = defineModel<string>({ required: true });
const { invalid = false, describedBy } = defineProps<{ invalid?: boolean; describedBy?: string }>();
const emit = defineEmits<{ complete: [code: string] }>();

const boxes = useTemplateRef<HTMLInputElement[]>("boxes");
/** Empty slots are stored as spaces so clearing a middle box keeps the others in place. */
const chars = computed(() =>
  Array.from({ length: INVITE_LENGTH }, (_, i) => (model.value[i] ?? "").trim()),
);

function focusBox(i: number): void {
  const el = boxes.value?.[Math.max(0, Math.min(INVITE_LENGTH - 1, i))];
  el?.focus();
  el?.select();
}

function commit(current: string[]): void {
  model.value = current
    .map((c) => c || " ")
    .join("")
    .trimEnd();
  if (current.every((c) => c)) emit("complete", current.join(""));
}

function setFrom(index: number, text: string): void {
  const incoming = normalizeInviteCode(text);
  if (!incoming) return;
  const current = chars.value.slice();
  for (let k = 0; k < incoming.length && index + k < INVITE_LENGTH; k++)
    current[index + k] = incoming[k]!;
  commit(current);
  focusBox(index + incoming.length);
}

function onInput(i: number, e: Event): void {
  const el = e.target as HTMLInputElement;
  const value = el.value;
  el.value = chars.value[i] ?? "";
  if (value)
    setFrom(
      i,
      value.length > 1 && value.startsWith(el.value) ? value.slice(el.value.length) : value,
    );
}

function onKeydown(i: number, e: KeyboardEvent): void {
  if (e.key === "Backspace") {
    e.preventDefault();
    const current = chars.value.slice();
    const target = current[i] ? i : i - 1;
    if (target < 0) return;
    current[target] = "";
    commit(current);
    focusBox(target);
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    focusBox(i - 1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    focusBox(i + 1);
  }
}

function onPaste(i: number, e: ClipboardEvent): void {
  e.preventDefault();
  setFrom(i, e.clipboardData?.getData("text") ?? "");
}
</script>

<template>
  <div
    class="boxes"
    role="group"
    aria-label="Código de convite, 8 caracteres"
    :aria-describedby="describedBy"
  >
    <input
      v-for="(c, i) in chars"
      :key="i"
      ref="boxes"
      class="box mono"
      :class="{ 'is-filled': c, 'is-gap': i === 3 }"
      type="text"
      inputmode="text"
      autocomplete="one-time-code"
      autocapitalize="characters"
      spellcheck="false"
      maxlength="8"
      :value="c"
      :aria-label="`Caractere ${i + 1} de 8`"
      :aria-invalid="invalid || undefined"
      @input="onInput(i, $event)"
      @keydown="onKeydown(i, $event)"
      @paste="onPaste(i, $event)"
      @focus="($event.target as HTMLInputElement).select()"
    />
  </div>
</template>

<style scoped>
.boxes {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 6px;
  max-width: 440px;
}

.box {
  width: 100%;
  aspect-ratio: 3 / 4;
  min-height: 48px;
  padding: 0;
  text-align: center;
  font-size: clamp(var(--t-20), 6vw, var(--t-28));
  font-weight: 600;
  text-transform: uppercase;
  color: var(--blue);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-bottom: 2px solid var(--ink-2);
  border-radius: var(--r-1);
  caret-color: var(--blue);
  transition:
    border-color var(--d-fast) var(--ease),
    transform var(--d-fast) var(--ease);
}

.box.is-gap {
  margin-right: 8px;
}

.box.is-filled {
  border-bottom-color: var(--blue);
}

.box:focus {
  outline: none;
  border-color: var(--blue);
  border-bottom-width: 3px;
}

.box[aria-invalid="true"] {
  border-bottom-color: var(--red);
}
</style>
