<script setup lang="ts">
import { computed } from "vue";
import IconButton from "@/components/ui/IconButton.vue";
import { telLink, whatsappLink } from "@/lib/contact.ts";
import type { ContactChannels } from "@/lib/contract.ts";
import { useToastStore } from "@/stores/toast.ts";

const { channels } = defineProps<{ channels: ContactChannels }>();

const toast = useToastStore();
const wa = computed(() => (channels.phone ? whatsappLink(channels.phone) : null));
const tel = computed(() => (channels.phone ? telLink(channels.phone) : null));
const mail = computed(() => (channels.email ? `mailto:${channels.email}` : null));

async function copyPix(): Promise<void> {
  if (!channels.pixKey) return;
  try {
    await navigator.clipboard.writeText(channels.pixKey);
    toast.success("Chave Pix copiada.");
  } catch {
    toast.error("Não deu para copiar. Selecione a chave e copie à mão.");
  }
}
</script>

<template>
  <div v-if="wa || tel || mail || channels.pixKey" class="ca" role="group" aria-label="Contato">
    <IconButton v-if="wa" icon="message" label="WhatsApp" :href="wa" />
    <IconButton v-if="tel" icon="phone" :label="`Ligar para ${channels.phone}`" :href="tel" />
    <IconButton v-if="mail" icon="mail" :label="`E-mail para ${channels.email}`" :href="mail" />
    <IconButton v-if="channels.pixKey" icon="copy" label="Copiar chave Pix" @click="copyPix" />
  </div>
</template>

<style scoped>
.ca {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--surface);
}
</style>
