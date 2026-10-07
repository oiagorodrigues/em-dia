<script setup lang="ts">
import { formatCents, formatYearMonth, RECEIPT_MIME_TYPES, type Payment } from "@emdia/shared";
import { computed, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from "vue";
import { errorMessage, paymentsApi } from "@/api";
import { sanitizeFilename } from "@/api/client.ts";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import IconButton from "@/components/ui/IconButton.vue";
import Sheet from "@/components/ui/Sheet.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useObjectUrl } from "@/composables/objectUrl.ts";
import { formatBytes } from "@/lib/format.ts";
import {
  panBy,
  zoomAt,
  ZOOM_FIT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  type Point,
  type ZoomState,
} from "@/lib/zoom.ts";

const open = defineModel<boolean>("open", { required: true });
const {
  payment,
  canReplace = false,
  replacing = false,
} = defineProps<{
  payment: Payment | null;
  /** Shows "Trocar comprovante"; the parent uploads the picked file and passes the new payment. */
  canReplace?: boolean;
  replacing?: boolean;
}>();
const emit = defineEmits<{ replace: [file: File] }>();

const picker = useTemplateRef<HTMLInputElement>("picker");
function onPicked(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) emit("replace", file);
}

const { url, set } = useObjectUrl();
const loading = ref(false);
const error = ref<string | null>(null);
const filename = ref("comprovante");

const isImage = computed(() => payment?.receipt?.mimeType.startsWith("image/") ?? false);

const zoom = ref<ZoomState>({ ...ZOOM_FIT });
const stage = useTemplateRef<HTMLElement>("stage");
const zoomed = computed(() => zoom.value.scale > ZOOM_MIN);
const percent = computed(() => `${Math.round(zoom.value.scale * 100)}%`);
const transform = computed(
  () => `translate(${zoom.value.x}px, ${zoom.value.y}px) scale(${zoom.value.scale})`,
);

function box(): { width: number; height: number } {
  const r = stage.value?.getBoundingClientRect();
  return { width: r?.width ?? 0, height: r?.height ?? 0 };
}

/** A client point as an offset from the stage centre, which is where the picture scales from. */
function toStage(clientX: number, clientY: number): Point {
  const r = stage.value?.getBoundingClientRect();
  if (!r) return { x: 0, y: 0 };
  return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
}

function zoomTo(scale: number, point: Point = { x: 0, y: 0 }): void {
  zoom.value = zoomAt(zoom.value, scale, point, box());
}

function zoomIn(): void {
  zoomTo(zoom.value.scale * ZOOM_STEP);
}

function zoomOut(): void {
  zoomTo(zoom.value.scale / ZOOM_STEP);
}

function fit(): void {
  zoom.value = { ...ZOOM_FIT };
}

/** ctrl/cmd + wheel, which is also what a trackpad pinch sends. A plain wheel scrolls the sheet. */
function onWheel(e: WheelEvent): void {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  zoomTo(zoom.value.scale * Math.exp(-e.deltaY * 0.0015), toStage(e.clientX, e.clientY));
}

const pointers = reactive(new Map<number, Point>());
const dragging = computed(() => pointers.size > 0 && zoomed.value);

function fingers(): [Point, Point] {
  const [a = { x: 0, y: 0 }, b = a] = [...pointers.values()];
  return [a, b];
}

function midpoint(): Point {
  const [a, b] = fingers();
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function spread(): number {
  const [a, b] = fingers();
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onPointerDown(e: PointerEvent): void {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  stage.value?.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
}

function onPointerMove(e: PointerEvent): void {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  if (pointers.size === 2) {
    const before = { mid: midpoint(), spread: spread() };
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const mid = midpoint();
    if (before.spread > 0) {
      const at = toStage(mid.x, mid.y);
      zoom.value = zoomAt(zoom.value, zoom.value.scale * (spread() / before.spread), at, box());
    }
    zoom.value = panBy(zoom.value, mid.x - before.mid.x, mid.y - before.mid.y, box());
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1 && zoomed.value) {
    zoom.value = panBy(zoom.value, e.clientX - prev.x, e.clientY - prev.y, box());
  }
}

function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId);
}

function onDoubleClick(e: MouseEvent): void {
  if (zoomed.value) fit();
  else zoomTo(2.5, toStage(e.clientX, e.clientY));
}

const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [40, 0],
  ArrowRight: [-40, 0],
  ArrowUp: [0, 40],
  ArrowDown: [0, -40],
};

/** Arrows pan only while the picture has focus, so they keep scrolling the sheet otherwise. */
function onStageKeydown(e: KeyboardEvent): void {
  const pan = PAN_KEYS[e.key];
  if (!pan || !zoomed.value) return;
  e.preventDefault();
  zoom.value = panBy(zoom.value, pan[0], pan[1], box());
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("input, textarea, select");
}

function onKeydown(e: KeyboardEvent): void {
  if (!isImage.value || !url.value || e.altKey || isTyping(e.target)) return;
  // ctrl/cmd + "+" would zoom the whole page; inside the viewer it zooms the receipt.
  if (e.key === "+" || e.key === "=") zoomIn();
  else if (e.key === "-" || e.key === "_") zoomOut();
  else if (e.key === "0") fit();
  else return;
  e.preventDefault();
}

watch(
  open,
  (isOpen) => {
    if (isOpen) document.addEventListener("keydown", onKeydown);
    else document.removeEventListener("keydown", onKeydown);
  },
  { immediate: true },
);
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));

watch(
  () => [open.value, payment?.id, payment?.receipt?.uploadedAt] as const,
  async ([isOpen, id]) => {
    if (!isOpen || !id || !payment?.receipt) return;
    loading.value = true;
    error.value = null;
    zoom.value = { ...ZOOM_FIT };
    set(null);
    try {
      const file = await paymentsApi.receipt(payment.contractId, id);
      filename.value = file.filename ?? sanitizeFilename(payment.receipt.originalName);
      set(file.blob);
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function onClosed(): void {
  set(null);
  pointers.clear();
  zoom.value = { ...ZOOM_FIT };
}
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Comprovante"
    :subtitle="
      payment
        ? `${formatCents(payment.amountCents)} · ${formatYearMonth(payment.referenceMonth)}`
        : undefined
    "
    @closed="onClosed"
  >
    <div class="rv">
      <!-- Inside the dialog: everything outside a modal dialog is inert. -->
      <input
        v-if="canReplace"
        ref="picker"
        class="visually-hidden"
        type="file"
        tabindex="-1"
        aria-hidden="true"
        :accept="RECEIPT_MIME_TYPES.join(',')"
        @change="onPicked"
      />
      <template v-if="loading">
        <div v-if="isImage" class="rv__tools" aria-hidden="true">
          <Skeleton w="176px" h="40px" />
        </div>
        <Skeleton h="64dvh" />
      </template>
      <EmptyState v-else-if="error" tone="error" title="Não deu para abrir o comprovante.">{{
        error
      }}</EmptyState>
      <template v-else-if="url && payment?.receipt">
        <template v-if="isImage">
          <div class="rv__tools" role="toolbar" aria-label="Zoom do comprovante">
            <IconButton
              icon="zoom-out"
              label="Diminuir (-)"
              :disabled="zoom.scale <= ZOOM_MIN"
              @click="zoomOut"
            />
            <output class="rv__pct mono" aria-live="polite">{{ percent }}</output>
            <IconButton
              icon="zoom-in"
              label="Ampliar (+)"
              :disabled="zoom.scale >= ZOOM_MAX"
              @click="zoomIn"
            />
            <IconButton icon="fit" label="Ajustar à tela (0)" :disabled="!zoomed" @click="fit" />
          </div>
          <div
            ref="stage"
            class="rv__stage"
            :class="{ 'is-zoomed': zoomed, 'is-dragging': dragging }"
            tabindex="0"
            :aria-label="`Comprovante de ${formatYearMonth(payment.referenceMonth)}. Use + e - para ampliar e as setas para mover.`"
            @wheel="onWheel"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @dblclick="onDoubleClick"
            @keydown="onStageKeydown"
          >
            <img
              :src="url"
              :alt="`Comprovante de ${formatYearMonth(payment.referenceMonth)}`"
              class="rv__img"
              :style="{ transform }"
              draggable="false"
            />
          </div>
          <p class="rv__hint">
            Use os botões, ctrl + roda do mouse ou dois dedos para ampliar. Com zoom, arraste para
            mover.
          </p>
        </template>
        <template v-else>
          <object :data="url" type="application/pdf" class="rv__pdf" :aria-label="filename">
            <p class="muted">Seu navegador não mostra PDF aqui. Use o botão abaixo para baixar.</p>
          </object>
          <p class="rv__hint">Para ampliar o PDF, use o zoom do leitor ou toque em Abrir.</p>
        </template>
        <p class="rv__meta mono">{{ filename }} · {{ formatBytes(payment.receipt.sizeBytes) }}</p>
      </template>
    </div>
    <template v-if="url || canReplace" #footer>
      <Button v-if="canReplace" icon="upload" :loading="replacing" @click="picker?.click()"
        >Trocar comprovante</Button
      >
      <template v-if="url">
        <Button :href="url" icon="external">Abrir</Button>
        <Button :href="url" :download="filename" icon="download" variant="primary">Baixar</Button>
      </template>
    </template>
  </Sheet>
</template>

<style scoped>
.rv {
  display: grid;
  gap: var(--s-3);
}

.rv__tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--s-1);
}

.rv__pct {
  min-width: 5ch;
  font-size: var(--t-12);
  color: var(--ink-2);
  text-align: center;
}

.rv__stage {
  position: relative;
  display: grid;
  place-items: center;
  height: 64dvh;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  /* Pinch and drag belong to the picture, not to the page. */
  touch-action: none;
  cursor: zoom-in;
}

.rv__stage.is-zoomed {
  cursor: grab;
}

.rv__stage.is-dragging {
  cursor: grabbing;
}

.rv__stage:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.rv__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  transform-origin: center;
  transition: transform var(--d-base) var(--ease-out);
  will-change: transform;
}

.rv__stage.is-dragging .rv__img {
  transition: none;
}

.rv__pdf {
  width: 100%;
  height: 64dvh;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
}

.rv__hint {
  font-size: var(--t-12);
  color: var(--ink-3);
}

.rv__meta {
  font-size: var(--t-12);
  color: var(--ink-2);
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  .rv__img {
    transition: none;
  }
}
</style>
