<script setup lang="ts">
import type { Contract, CreateContractInput } from "@ponto/shared";
import { ref } from "vue";
import { contractsApi, errorMessage } from "@/api";
import ContractForm from "@/components/feature/ContractForm.vue";
import InviteCard from "@/components/feature/InviteCard.vue";
import Button from "@/components/ui/Button.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import { useToastStore } from "@/stores/toast.ts";

const toast = useToastStore();
const created = ref<Contract | null>(null);
const invite = ref<{ code: string; expiresAt: string } | null>(null);
const inviteError = ref<string | null>(null);
const inviting = ref(false);

async function save(data: CreateContractInput): Promise<void> {
  const { contract } = await contractsApi.create(data);
  created.value = contract;
  window.scrollTo({ top: 0 });
  await generateInvite();
}

async function generateInvite(): Promise<void> {
  if (!created.value) return;
  inviting.value = true;
  inviteError.value = null;
  try {
    invite.value = await contractsApi.invite(created.value.id);
  } catch (e) {
    inviteError.value = errorMessage(e);
    toast.error(inviteError.value);
  } finally {
    inviting.value = false;
  }
}
</script>

<template>
  <div class="nc">
    <template v-if="created">
      <PageHeader back="/" :title="`cadastro de ${created.workerName.split(' ')[0]} feito.`" />
      <p class="muted">
        Agora mande o código para a pessoa criar a conta no celular. Enquanto isso, você já pode
        anotar os dias por aqui.
      </p>
      <InviteCard
        v-if="invite"
        :code="invite.code"
        :expires-at="invite.expiresAt"
        :worker-name="created.workerName"
      />
      <div v-else-if="inviteError" class="form-error" role="alert">
        {{ inviteError }}
        <Button variant="ghost" :loading="inviting" @click="generateInvite">tentar de novo</Button>
      </div>
      <div class="nc__next">
        <Button :to="`/vinculos/${created.id}`" variant="secondary" icon-right="arrow-right"
          >abrir o cartão</Button
        >
        <Button to="/" variant="ghost">voltar ao início</Button>
      </div>
    </template>
    <template v-else>
      <PageHeader
        back="/"
        title="adicionar profissional"
        lede="Os dados do combinado. Dá para mudar depois."
      />
      <ContractForm submit-label="cadastrar e gerar convite" :save="save" />
    </template>
  </div>
</template>

<style scoped>
.nc {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.nc__next {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
}
</style>
