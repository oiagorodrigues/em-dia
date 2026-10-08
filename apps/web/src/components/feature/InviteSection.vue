<script setup lang="ts">
import type { Contract, InviteDelivery } from "@emdia/shared";
import { computed, ref } from "vue";
import { contractsApi, errorMessage } from "@/api";
import Button from "@/components/ui/Button.vue";
import { useToastStore } from "@/stores/toast.ts";
import InviteCard from "./InviteCard.vue";

const { contract } = defineProps<{ contract: Contract }>();
const emit = defineEmits<{ edit: [] }>();
const toast = useToastStore();

const invite = ref<InviteDelivery | null>(null);
const inviting = ref(false);
async function sendInvite(): Promise<void> {
  inviting.value = true;
  try {
    invite.value = (await contractsApi.invite(contract.id)).invite;
    toast.success(
      invite.value.emailSent
        ? `Convite enviado para ${contract.contactEmail}.`
        : "Código novo gerado. O anterior não vale mais.",
    );
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    inviting.value = false;
  }
}

const label = computed(() => {
  if (invite.value) return "Gerar outro código";
  return contract.contactEmail ? "Reenviar convite" : "Gerar código de convite";
});
</script>

<template>
  <section class="iv sheet" :class="{ 'has-code': invite }" aria-labelledby="iv-title">
    <div class="iv__head">
      <h2 id="iv-title" class="section-title">Convite</h2>
      <p class="muted">
        <template v-if="invite">Gerar outro código invalida o anterior.</template>
        <template v-else-if="contract.contactEmail"
          >{{ contract.workerName }} ainda não entrou. Mande o convite de novo para
          <strong>{{ contract.contactEmail }}</strong
          >{{ contract.contactPhone ? " ou pelo WhatsApp" : "" }}.</template
        >
        <template v-else-if="contract.contactPhone"
          >{{ contract.workerName }} ainda não entrou. Gere um código e mande pelo
          WhatsApp.</template
        >
        <template v-else
          >Ainda ninguém entrou. Gere um código e mande para a pessoa, ou
          <button type="button" class="link-btn" @click="emit('edit')">coloque um e-mail</button>
          para a gente mandar.</template
        >
      </p>
    </div>
    <InviteCard
      v-if="invite"
      :code="invite.code"
      :expires-at="invite.expiresAt"
      :worker-name="contract.workerName"
      :delivery="invite"
      :email="contract.contactEmail"
    />
    <Button
      class="iv__btn"
      :variant="invite ? 'secondary' : 'primary'"
      :icon="contract.contactEmail && !invite ? 'mail' : 'key'"
      :loading="inviting"
      @click="sendInvite"
    >
      {{ label }}
    </Button>
  </section>
</template>

<style scoped>
.iv {
  display: grid;
  gap: var(--s-4);
  justify-items: start;
  min-width: 0;
  padding: var(--s-5);
}

.iv > :deep(.inv) {
  justify-self: stretch;
}

.iv__head {
  display: grid;
  gap: var(--s-2);
}

/* Inline in the sentence: the 44px tap height would push the line apart. */
.iv__head .link-btn {
  display: inline;
  min-height: 0;
}

@media (min-width: 960px) {
  .iv {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--s-6);
  }
  .iv.has-code {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    grid-template-rows: auto 1fr;
    align-items: start;
  }
  .iv.has-code > :deep(.inv) {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
  .iv.has-code > .iv__btn {
    grid-column: 1;
    grid-row: 2;
  }
}
</style>
