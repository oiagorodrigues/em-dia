<script setup lang="ts">
import type { Contract, InviteDelivery } from "@emdia/shared";
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";
import { firstName } from "@/lib/format.ts";
import { useToastStore } from "@/stores/toast.ts";

const { contract, invite } = defineProps<{ contract: Contract; invite: InviteDelivery }>();

const toast = useToastStore();
const name = computed(() => firstName(contract.workerName));
const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
const expires = computed(() =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(invite.expiresAt)),
);
const message = computed(
  () =>
    `Oi, ${name.value}! Crie sua conta no em dia para marcar seus dias pelo celular. Código: ${invite.code}`,
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
    await navigator.share({ title: "em dia", text: message.value, url: invite.signupUrl });
  } catch {
    /* the person closed the share sheet */
  }
}
</script>

<template>
  <div class="isx">
    <section class="isx__card" aria-label="Código de convite">
      <div class="isx__intro">
        <h2 class="isx__title">Convite para o app</h2>
        <p class="isx__explain">
          Com ele, {{ name }} cria a conta no celular para bater o ponto e confirmar os dias. É
          opcional: você já pode registrar tudo por aqui.
        </p>
      </div>

      <div class="isx__codebox">
        <p class="label">Código</p>
        <p class="inv__code mono" :aria-label="invite.code.split('').join(' ')">
          <span>{{ invite.code.slice(0, 4) }}</span
          ><span>{{ invite.code.slice(4) }}</span>
        </p>
        <p class="isx__exp">vale até {{ expires }} · uso único</p>
        <Button icon="copy" @click="copy(invite.code, 'Código')">copiar código</Button>
      </div>

      <div class="isx__link">
        <p class="label">Link de cadastro</p>
        <div class="isx__url">
          <span class="mono">{{ invite.signupUrl }}</span>
          <button
            type="button"
            class="isx__copy"
            aria-label="Copiar link de cadastro"
            @click="copy(invite.signupUrl, 'Link')"
          >
            <Icon name="copy" :size="16" />
            copiar
          </button>
        </div>
      </div>

      <p v-if="invite.emailSent && contract.contactEmail" class="isx__sent" role="status">
        <Icon name="mail" :size="18" />
        <span
          >e-mail enviado para <strong>{{ contract.contactEmail }}</strong></span
        >
      </p>

      <div class="isx__actions">
        <Button
          v-if="invite.whatsappUrl"
          :href="invite.whatsappUrl"
          variant="primary"
          icon="message"
          >mandar no WhatsApp</Button
        >
        <Button
          v-if="canShare"
          :variant="invite.whatsappUrl ? 'secondary' : 'primary'"
          icon="share"
          @click="share"
          >compartilhar</Button
        >
        <Button
          v-else
          :variant="invite.whatsappUrl ? 'secondary' : 'primary'"
          icon="link"
          @click="copy(`${message} ${invite.signupUrl}`, 'Convite')"
          >copiar convite</Button
        >
      </div>
    </section>

    <aside class="isx__aside">
      <h2 class="label">Como funciona</h2>
      <ol class="isx__steps">
        <li>
          <span class="isx__n mono">1</span>
          <span>{{ name }} abre o link (ou entra em “criar conta” e digita o código).</span>
        </li>
        <li>
          <span class="isx__n mono">2</span>
          <span>Cria a conta como profissional, pelo celular.</span>
        </li>
        <li>
          <span class="isx__n mono">3</span>
          <span>Pronto: vocês passam a ver o mesmo cartão e confirmam os dias pelo app.</span>
        </li>
      </ol>
      <div v-if="$slots.default" class="isx__next"><slot /></div>
    </aside>
  </div>
</template>

<style scoped>
.isx {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.isx__card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
  padding: var(--s-7);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  box-shadow: var(--shadow-1);
}

.isx__intro {
  display: grid;
  gap: var(--s-2);
}

.isx__title {
  font-size: var(--t-20);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.isx__explain {
  color: var(--ink-2);
  max-width: 60ch;
}

.isx__codebox {
  display: grid;
  justify-items: start;
  gap: var(--s-2);
  padding: var(--s-6);
  border-radius: var(--r-2);
  background: var(--brand-wash);
  color: var(--brand-ink);
}

.isx__codebox .label {
  color: inherit;
}

.inv__code {
  display: flex;
  gap: 0.4em;
  font-size: clamp(var(--t-40), 8vw, var(--t-64));
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1;
  color: var(--ink);
}

.isx__exp {
  font-size: var(--t-14);
  margin-bottom: var(--s-2);
}

.isx__link {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-2);
}

.isx__url {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 48px;
  padding: 0 var(--s-2) 0 var(--s-4);
  border: 1px dashed var(--ink-3);
  border-radius: var(--r-1);
  background: var(--surface-2);
}

.isx__url .mono {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--t-12);
  font-stretch: 87.5%;
}

.isx__copy {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 40px;
  padding: 0 var(--s-3);
  border-radius: var(--r-1);
  font-size: var(--t-14);
  font-weight: 600;
  color: var(--brand);
}

.isx__copy:hover {
  background: var(--brand-wash);
}

.isx__sent {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-1);
  background: var(--brand-wash);
  color: var(--brand-ink);
  font-size: var(--t-14);
  overflow-wrap: anywhere;
}

.isx__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
}

.isx__aside {
  display: grid;
  align-content: start;
  gap: var(--s-4);
}

.isx__next {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  padding-top: var(--s-4);
  border-top: 1px solid var(--rule);
}

.isx__steps {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s-3);
  color: var(--ink-2);
  font-size: var(--t-14);
}

.isx__steps li {
  display: flex;
  gap: var(--s-3);
  align-items: baseline;
}

.isx__n {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--ink);
  font-size: var(--t-12);
  font-weight: 700;
}

@media (min-width: 960px) {
  .isx {
    grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr);
    column-gap: var(--s-8);
    align-items: start;
  }
  .isx__aside {
    position: sticky;
    top: var(--s-6);
    padding-top: var(--s-4);
  }
}

@media (max-width: 639px) {
  .isx__card {
    padding: var(--s-5);
  }
  .isx__codebox {
    padding: var(--s-5);
  }
}
</style>
