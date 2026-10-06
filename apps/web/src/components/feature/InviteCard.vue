<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";
import { firstName } from "@/lib/format.ts";
import { inviteLink } from "@/lib/invite.ts";
import { useToastStore } from "@/stores/toast.ts";

const { code, expiresAt, workerName } = defineProps<{
  code: string;
  expiresAt: string;
  workerName: string;
}>();

const toast = useToastStore();
const link = computed(() => inviteLink(code));
const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
const expires = computed(() =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(expiresAt)),
);

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error("Não deu para copiar. Selecione e copie à mão.");
  }
}

async function share(): Promise<void> {
  try {
    await navigator.share({
      title: "em dia",
      text: `Oi, ${firstName(workerName)}! Crie sua conta no em dia para marcar seus dias pelo celular. Código: ${code}`,
      url: link.value,
    });
  } catch {
    /* user closed the share sheet */
  }
}
</script>

<template>
  <section class="inv" aria-label="Código de convite">
    <p class="label">código de convite</p>
    <p class="inv__code mono" :aria-label="code.split('').join(' ')">
      <span>{{ code.slice(0, 4) }}</span
      ><span>{{ code.slice(4) }}</span>
    </p>
    <p class="inv__exp">vale até {{ expires }} · uso único</p>
    <div class="inv__actions">
      <Button icon="copy" @click="copy(code, 'Código')">copiar código</Button>
      <Button v-if="canShare" icon="share" variant="primary" @click="share">compartilhar</Button>
      <Button v-else icon="link" variant="primary" @click="copy(link, 'Link')">copiar link</Button>
    </div>
    <p class="inv__link">
      ou mande o link:
      <a :href="link" class="mono" rel="noopener">{{ link.replace(/^https?:\/\//, "") }}</a>
    </p>
  </section>
</template>

<style scoped>
.inv {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-6) var(--s-5);
  background: var(--sheet);
  border: 1px solid var(--ink);
  border-radius: var(--r-2);
  box-shadow: var(--press);
}

.inv__code {
  display: flex;
  gap: 0.5em;
  font-size: clamp(2rem, 11vw, var(--t-64));
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--blue);
  line-height: 1.1;
  user-select: all;
}

.inv__exp {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.inv__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-2);
}

.inv__link {
  font-size: var(--t-14);
  color: var(--ink-2);
  overflow-wrap: anywhere;
}

.inv__link a {
  font-size: var(--t-12);
}
</style>
