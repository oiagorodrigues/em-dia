<script setup lang="ts">
import { formatCents, formatYearMonth, type Payment } from "@emdia/shared";
import { computed, ref, watch } from "vue";
import { errorMessage, paymentsApi } from "@/api";
import { sanitizeFilename } from "@/api/client.ts";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Sheet from "@/components/ui/Sheet.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useObjectUrl } from "@/composables/objectUrl.ts";
import { formatBytes } from "@/lib/format.ts";

const open = defineModel<boolean>("open", { required: true });
const { payment } = defineProps<{ payment: Payment | null }>();

const { url, set } = useObjectUrl();
const loading = ref(false);
const error = ref<string | null>(null);
const filename = ref("comprovante");

const isImage = computed(() => payment?.receipt?.mimeType.startsWith("image/") ?? false);

watch(
  () => [open.value, payment?.id] as const,
  async ([isOpen, id]) => {
    if (!isOpen || !id || !payment?.receipt) return;
    loading.value = true;
    error.value = null;
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
      <Skeleton v-if="loading" h="320px" />
      <EmptyState v-else-if="error" tone="error" title="Não deu para abrir o comprovante.">{{
        error
      }}</EmptyState>
      <template v-else-if="url && payment?.receipt">
        <img
          v-if="isImage"
          :src="url"
          :alt="`Comprovante de ${formatYearMonth(payment.referenceMonth)}`"
          class="rv__img"
        />
        <object v-else :data="url" type="application/pdf" class="rv__pdf" :aria-label="filename">
          <p class="muted">Seu navegador não mostra PDF aqui. Use o botão abaixo para baixar.</p>
        </object>
        <p class="rv__meta mono">{{ filename }} · {{ formatBytes(payment.receipt.sizeBytes) }}</p>
      </template>
    </div>
    <template v-if="url" #footer>
      <Button :href="url" icon="external">Abrir</Button>
      <Button :href="url" :download="filename" icon="download" variant="primary">Baixar</Button>
    </template>
  </Sheet>
</template>

<style scoped>
.rv {
  display: grid;
  gap: var(--s-3);
}

.rv__img {
  width: 100%;
  max-height: 64dvh;
  object-fit: contain;
  background: var(--bg);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
}

.rv__pdf {
  width: 100%;
  height: 64dvh;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
}

.rv__meta {
  font-size: var(--t-12);
  color: var(--ink-2);
  overflow-wrap: anywhere;
}
</style>
