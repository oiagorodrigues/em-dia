<script setup lang="ts">
import type { Contract, CreateContractInput, InviteDelivery } from "@emdia/shared";
import { ref } from "vue";
import { contractsApi, errorMessage } from "@/api";
import ContractForm from "@/components/feature/ContractForm.vue";
import InviteSuccess from "@/components/feature/InviteSuccess.vue";
import Button from "@/components/ui/Button.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import { firstName } from "@/lib/format.ts";
import { useToastStore } from "@/stores/toast.ts";

const toast = useToastStore();
const created = ref<Contract | null>(null);
const invite = ref<InviteDelivery | null>(null);
const inviteError = ref<string | null>(null);
const inviting = ref(false);
const formKey = ref(0);

async function save(data: CreateContractInput): Promise<void> {
  const res = await contractsApi.create(data);
  created.value = res.contract;
  window.scrollTo({ top: 0 });
  if (res.invite) invite.value = res.invite;
  else await generateInvite();
}

async function generateInvite(): Promise<void> {
  if (!created.value) return;
  inviting.value = true;
  inviteError.value = null;
  try {
    invite.value = (await contractsApi.invite(created.value.id)).invite;
  } catch (e) {
    inviteError.value = errorMessage(e);
    toast.error(inviteError.value);
  } finally {
    inviting.value = false;
  }
}

function addAnother(): void {
  created.value = null;
  invite.value = null;
  inviteError.value = null;
  formKey.value++;
  window.scrollTo({ top: 0 });
}
</script>

<template>
  <div class="nc">
    <template v-if="created">
      <PageHeader
        back="/equipe"
        back-label="equipe"
        :title="`cadastro de ${firstName(created.workerName)} feito.`"
        subtitle="Agora mande o convite para a pessoa criar a conta no celular. Enquanto isso, você já pode anotar os dias por aqui."
      />
      <InviteSuccess v-if="invite" :contract="created" :invite="invite">
        <Button :to="`/equipe/${created.id}`" variant="primary" icon-right="arrow-right"
          >ir para o profissional</Button
        >
        <Button variant="ghost" icon="plus" @click="addAnother">adicionar outra pessoa</Button>
      </InviteSuccess>
      <template v-else>
        <div v-if="inviteError" class="form-error" role="alert">
          {{ inviteError }}
          <Button variant="ghost" :loading="inviting" @click="generateInvite"
            >tentar de novo</Button
          >
        </div>
        <Skeleton v-else h="320px" />
        <div class="nc__next">
          <Button :to="`/equipe/${created.id}`" variant="primary" icon-right="arrow-right"
            >ir para o profissional</Button
          >
        </div>
      </template>
    </template>
    <template v-else>
      <PageHeader
        back="/equipe"
        back-label="equipe"
        title="adicionar profissional"
        subtitle="Os dados do combinado. Dá para mudar depois."
      />
      <ContractForm
        :key="formKey"
        submit-label="cadastrar e gerar convite"
        :save="save"
        contact
        summary
      />
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
