<script setup lang="ts">
import { computed } from "vue";
import Icon from "@/components/ui/Icon.vue";
import { telLink, whatsappLink } from "@/lib/contact.ts";
import { useToastStore } from "@/stores/toast.ts";

const {
  pixKey,
  phone,
  compact = false,
} = defineProps<{ pixKey: string | null; phone?: string | null; compact?: boolean }>();

const toast = useToastStore();
const wa = computed(() => (phone ? whatsappLink(phone) : null));
const tel = computed(() => (phone ? telLink(phone) : null));

async function copyPix(): Promise<void> {
  if (!pixKey) return;
  try {
    await navigator.clipboard.writeText(pixKey);
    toast.success("Chave Pix copiada.");
  } catch {
    toast.error("Não deu para copiar. Selecione a chave e copie à mão.");
  }
}
</script>

<template>
  <div v-if="pixKey || (phone && !compact)" class="wc" :class="{ 'wc--compact': compact }">
    <div v-if="pixKey" class="wc__pix">
      <span class="label">pix</span>
      <span class="wc__key mono">{{ pixKey }}</span>
      <button type="button" class="wc__copy" @click="copyPix">
        <Icon name="copy" :size="16" />
        copiar
      </button>
    </div>
    <div v-if="phone && !compact" class="wc__phone">
      <a v-if="tel" :href="tel" class="wc__link mono">{{ phone }}</a>
      <span v-else class="mono">{{ phone }}</span>
      <a v-if="wa" :href="wa" target="_blank" rel="noopener noreferrer" class="wc__link">
        WhatsApp
        <Icon name="external" :size="14" />
      </a>
    </div>
  </div>
</template>

<style scoped>
.wc {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  align-items: center;
  font-size: var(--t-14);
}

.wc__pix,
.wc__phone {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
}

.wc__key {
  font-size: var(--t-12);
  color: var(--ink);
  overflow-wrap: anywhere;
  min-width: 0;
}

.wc__copy {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 44px;
  padding: 0 var(--s-2);
  font-weight: 600;
  color: var(--brand);
  border-radius: var(--r-1);
}

.wc__copy:hover {
  background: var(--brand-wash);
}

.wc__link {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 44px;
  font-weight: 600;
}

.wc__phone .mono {
  font-size: var(--t-12);
}

.wc--compact {
  padding: var(--s-1) var(--s-1) var(--s-1) var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
}

.wc--compact .wc__pix {
  flex: 1;
}

.wc--compact .wc__key {
  flex: 1;
}
</style>
