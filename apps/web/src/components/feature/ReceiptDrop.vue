<script setup lang="ts">
import { RECEIPT_MIME_TYPES } from "@emdia/shared";
import { computed, ref, useId } from "vue";
import { sanitizeFilename } from "@/api/client.ts";
import Icon from "@/components/ui/Icon.vue";
import { useObjectUrl } from "@/composables/objectUrl.ts";
import { formatBytes } from "@/lib/format.ts";
import { receiptProblem } from "@/lib/receipt.ts";

const model = defineModel<File | null>({ required: true });
const id = useId();
const error = ref<string | null>(null);
const over = ref(false);
const { url, set } = useObjectUrl();

const isImage = computed(() => !!model.value && model.value.type.startsWith("image/"));
const name = computed(() => (model.value ? sanitizeFilename(model.value.name) : ""));

function accept(file: File | undefined | null): void {
  if (!file) return;
  const problem = receiptProblem(file);
  error.value = problem;
  if (problem) return;
  model.value = file;
  set(file.type.startsWith("image/") ? file : null);
}

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  accept(input.files?.[0]);
  input.value = "";
}

function onDrop(e: DragEvent): void {
  over.value = false;
  accept(e.dataTransfer?.files?.[0]);
}

function clear(): void {
  model.value = null;
  set(null);
  error.value = null;
}
</script>

<template>
  <div class="rd">
    <div v-if="model" class="rd__file">
      <img v-if="isImage && url" :src="url" alt="Prévia do comprovante" class="rd__preview" />
      <span v-else class="rd__pdf"
        ><Icon name="file" :size="28" /><span class="mono">PDF</span></span
      >
      <div class="rd__meta">
        <p class="rd__name">{{ name }}</p>
        <p class="rd__size mono">{{ formatBytes(model.size) }}</p>
      </div>
      <button type="button" class="rd__x" aria-label="Remover comprovante" @click="clear">
        <Icon name="close" :size="18" />
      </button>
    </div>
    <label
      v-else
      :for="id"
      class="rd__zone"
      :class="{ 'is-over': over, 'is-error': !!error }"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop.prevent="onDrop"
    >
      <Icon name="upload" :size="24" />
      <span class="rd__cta">Anexar comprovante</span>
      <span class="rd__hint">Foto ou PDF, até 5 MB</span>
      <input
        :id="id"
        class="visually-hidden"
        type="file"
        :accept="RECEIPT_MIME_TYPES.join(',')"
        :aria-describedby="error ? `${id}-err` : undefined"
        @change="onPick"
      />
    </label>
    <p v-if="error" :id="`${id}-err`" class="rd__err" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.rd__zone {
  display: grid;
  justify-items: center;
  gap: var(--s-1);
  padding: var(--s-6) var(--s-4);
  border: 1.5px dashed var(--ink-3);
  border-radius: var(--r-2);
  color: var(--ink-2);
  text-align: center;
  cursor: pointer;
  transition:
    border-color var(--d-fast) var(--ease),
    background-color var(--d-fast) var(--ease);
}

.rd__zone:hover,
.rd__zone.is-over {
  border-color: var(--brand);
  background: var(--brand-wash);
  color: var(--ink);
}

.rd__zone:has(:focus-visible) {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.rd__zone.is-error {
  border-color: var(--coral);
}

.rd__cta {
  font-weight: 700;
  color: var(--brand);
}

.rd__hint {
  font-size: var(--t-12);
}

.rd__file {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
}

.rd__preview,
.rd__pdf {
  width: 64px;
  height: 80px;
  flex: none;
  object-fit: cover;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
}

.rd__pdf {
  display: grid;
  place-content: center;
  justify-items: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--coral-ink);
  background: var(--bg);
}

.rd__meta {
  flex: 1;
  min-width: 0;
}

.rd__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rd__size {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.rd__x {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  color: var(--ink-2);
  border-radius: var(--r-1);
}

.rd__x:hover {
  color: var(--ink);
  background: var(--bg);
}

.rd__err {
  margin-top: var(--s-2);
  font-size: var(--t-14);
  color: var(--coral-ink);
}
</style>
