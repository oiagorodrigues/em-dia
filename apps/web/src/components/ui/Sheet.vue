<script setup lang="ts">
import { nextTick, onBeforeUnmount, useId, useTemplateRef, watch } from "vue";
import Icon from "./Icon.vue";

const open = defineModel<boolean>("open", { required: true });
const { title, subtitle } = defineProps<{ title: string; subtitle?: string }>();
const emit = defineEmits<{ closed: [] }>();

const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const titleId = useId();
let closing = false;

watch(
  open,
  async (value) => {
    await nextTick();
    const el = dialog.value;
    if (!el) return;
    if (value && !el.open) {
      closing = false;
      el.showModal();
      document.documentElement.classList.add("has-sheet");
    } else if (!value && el.open) {
      await animateOut(el);
    }
  },
  { immediate: true },
);

async function animateOut(el: HTMLDialogElement): Promise<void> {
  if (closing) return;
  closing = true;
  el.classList.add("is-leaving");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  await new Promise((r) => setTimeout(r, reduce ? 0 : 180));
  el.classList.remove("is-leaving");
  el.close();
}

function onClose(): void {
  closing = false;
  document.documentElement.classList.remove("has-sheet");
  if (open.value) open.value = false;
  emit("closed");
}

function onCancel(e: Event): void {
  e.preventDefault();
  open.value = false;
}

/** A press that starts and ends on the backdrop (the dialog box itself, outside the panel) closes. */
let downOnBackdrop = false;
function onPointerDown(e: PointerEvent): void {
  downOnBackdrop = e.target === dialog.value;
}
function onPointerUp(e: PointerEvent): void {
  if (downOnBackdrop && e.target === dialog.value) open.value = false;
  downOnBackdrop = false;
}

onBeforeUnmount(() => document.documentElement.classList.remove("has-sheet"));
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet-dlg"
    :aria-labelledby="titleId"
    @close="onClose"
    @cancel="onCancel"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
  >
    <div class="sheet-dlg__panel">
      <header class="sheet-dlg__head">
        <div>
          <h2 :id="titleId" class="sheet-dlg__title">{{ title }}</h2>
          <p v-if="subtitle" class="sheet-dlg__sub">{{ subtitle }}</p>
        </div>
        <button type="button" class="sheet-dlg__close" aria-label="Fechar" @click="open = false">
          <Icon name="close" />
        </button>
      </header>
      <div class="sheet-dlg__body">
        <slot v-if="open" />
      </div>
      <footer v-if="$slots.footer" class="sheet-dlg__foot">
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.sheet-dlg {
  /* The dialog box is the full-viewport backdrop hit area; the panel is the visible sheet. */
  position: fixed;
  inset: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  display: none;
  align-items: flex-end;
  justify-content: center;
  overscroll-behavior: contain;
}

.sheet-dlg[open] {
  display: flex;
}

.sheet-dlg::backdrop {
  background: color-mix(in srgb, var(--ink) 40%, transparent);
  animation: fade-in var(--d-sheet) var(--ease);
}

.sheet-dlg__panel {
  width: 100%;
  max-width: 560px;
  max-height: min(92dvh, 100%);
  display: flex;
  flex-direction: column;
  background: var(--sheet);
  border: 1px solid var(--rule);
  border-bottom: 0;
  border-radius: var(--r-2) var(--r-2) 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  animation: sheet-up var(--d-sheet) var(--ease);
}

.sheet-dlg.is-leaving .sheet-dlg__panel {
  animation: sheet-down 180ms var(--ease) forwards;
}

.sheet-dlg.is-leaving::backdrop {
  animation: fade-out 180ms var(--ease) forwards;
}

.sheet-dlg__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-5) var(--s-5) var(--s-3);
  border-bottom: 1px dashed var(--rule);
}

.sheet-dlg__title {
  font-size: var(--t-20);
  letter-spacing: -0.02em;
}

.sheet-dlg__sub {
  margin-top: var(--s-1);
  color: var(--ink-2);
  font-size: var(--t-14);
}

.sheet-dlg__close {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: -10px -10px 0 0;
  border-radius: var(--r-1);
  color: var(--ink-2);
}

.sheet-dlg__close:hover {
  color: var(--ink);
  background: var(--paper);
}

.sheet-dlg__body {
  padding: var(--s-5);
  overflow-y: auto;
  flex: 1;
}

.sheet-dlg__foot {
  display: flex;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5) var(--s-5);
  border-top: 1px solid var(--rule);
}

.sheet-dlg__foot > :deep(*) {
  flex: 1;
}

@media (min-width: 720px) {
  .sheet-dlg {
    align-items: center;
  }
  .sheet-dlg__panel {
    border-bottom: 1px solid var(--rule);
    border-radius: var(--r-2);
    max-height: 86dvh;
    animation-name: sheet-in;
  }
  .sheet-dlg.is-leaving .sheet-dlg__panel {
    animation-name: sheet-out;
  }
}

@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
}
@keyframes sheet-down {
  to {
    transform: translateY(100%);
  }
}
@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
@keyframes sheet-out {
  to {
    opacity: 0;
    transform: translateY(12px);
  }
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
@keyframes fade-out {
  to {
    opacity: 0;
  }
}
</style>
