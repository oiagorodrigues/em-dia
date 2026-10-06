<script setup lang="ts">
import type { Receipt } from "@emdia/shared";
import { onMounted, ref } from "vue";
import { paymentsApi } from "@/api";
import Icon from "@/components/ui/Icon.vue";
import { useObjectUrl } from "@/composables/objectUrl.ts";

const { contractId, paymentId, receipt } = defineProps<{
  contractId: string;
  paymentId: string;
  receipt: Receipt;
}>();

const { url, set } = useObjectUrl();
const failed = ref(false);
const isImage = receipt.mimeType.startsWith("image/");

onMounted(async () => {
  if (!isImage) return;
  try {
    const { blob } = await paymentsApi.receipt(contractId, paymentId);
    set(blob);
  } catch {
    failed.value = true;
  }
});
</script>

<template>
  <span class="thumb" :class="{ 'is-pdf': !isImage }">
    <img v-if="url" :src="url" alt="" class="thumb__img" />
    <span v-else-if="isImage && !failed" class="skeleton thumb__img" />
    <span v-else class="thumb__icon">
      <Icon :name="isImage ? 'image' : 'file'" :size="22" />
      <span v-if="!isImage" class="thumb__ext mono">PDF</span>
    </span>
  </span>
</template>

<style scoped>
.thumb {
  display: grid;
  place-items: center;
  width: 56px;
  height: 64px;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--paper);
  overflow: hidden;
  flex: none;
}

.thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb__icon {
  display: grid;
  justify-items: center;
  gap: 2px;
  color: var(--ink-2);
}

.thumb__ext {
  font-size: 9px;
  font-weight: 700;
  color: var(--red-text);
}
</style>
