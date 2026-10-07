<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  endContractSchema,
  nowInZone,
  type CreateContractInput,
  type InviteDelivery,
} from "@emdia/shared";
import { computed, ref } from "vue";
import { contractsApi, errorMessage } from "@/api";
import ContractForm from "@/components/feature/ContractForm.vue";
import InviteCard from "@/components/feature/InviteCard.vue";
import Button from "@/components/ui/Button.vue";
import DateField from "@/components/ui/DateField.vue";
import Field from "@/components/ui/Field.vue";
import Sheet from "@/components/ui/Sheet.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useForm } from "@/composables/form.ts";
import { formatDateShort } from "@/lib/format.ts";
import { useToastStore } from "@/stores/toast.ts";
import { isWritable } from "@/lib/contract.ts";

const toast = useToastStore();
const { contract, replaceContract, askRemove, restore, restoring } = useContract();
const writable = computed(() => isWritable(contract.value));

async function save(data: CreateContractInput): Promise<void> {
  const { householdId: _, ...patch } = data;
  const { contract: updated } = await contractsApi.update(contract.value.id, patch);
  replaceContract(updated);
  toast.success("Combinado atualizado.");
}

const invite = ref<InviteDelivery | null>(null);
const inviting = ref(false);
async function sendInvite(): Promise<void> {
  inviting.value = true;
  try {
    invite.value = (await contractsApi.invite(contract.value.id)).invite;
    toast.success(
      invite.value.emailSent
        ? `Convite enviado para ${contract.value.contactEmail}.`
        : "Código novo gerado. O anterior não vale mais.",
    );
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    inviting.value = false;
  }
}

const inviteLabel = computed(() => {
  if (invite.value) return "gerar outro código";
  return contract.value.contactEmail ? "reenviar convite" : "gerar código de convite";
});

const endOpen = ref(false);
const endForm = useForm(endContractSchema, { endedOn: nowInZone(DEFAULT_TIMEZONE).date });
function onEnd(): void {
  void endForm.submit(async (data) => {
    const { contract: updated } = await contractsApi.end(contract.value.id, data.endedOn);
    replaceContract(updated);
    endOpen.value = false;
    toast.success("Vínculo encerrado. O histórico continua aqui.");
  });
}
</script>

<template>
  <div class="st">
    <section
      v-if="!contract.workerId && writable"
      class="st__block sheet st__invite"
      aria-labelledby="st-invite"
    >
      <div class="st__head">
        <h2 id="st-invite" class="section-title">Convite</h2>
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
            >Ainda ninguém entrou. Gere um código e mande para a pessoa, ou coloque um e-mail no
            contato abaixo para a gente mandar.</template
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
        :variant="invite ? 'secondary' : 'primary'"
        :icon="contract.contactEmail && !invite ? 'mail' : 'key'"
        :loading="inviting"
        @click="sendInvite"
      >
        {{ inviteLabel }}
      </Button>
    </section>
    <p v-else-if="contract.workerId" class="st__joined muted">
      {{ contract.workerName }} já entrou no vínculo e bate o ponto pelo próprio celular.
    </p>

    <section v-if="writable" class="st__block" aria-labelledby="st-edit">
      <h2 id="st-edit" class="section-title">Combinado e contato</h2>
      <ContractForm
        :key="contract.id"
        :initial="{
          workerName: contract.workerName,
          occupation: contract.occupation,
          payType: contract.payType,
          rateCents: contract.rateCents,
          schedule: contract.schedule,
          deductAbsences: contract.deductAbsences,
          expectedStart: contract.expectedStart,
          expectedEnd: contract.expectedEnd,
          startedOn: contract.startedOn,
          contactEmail: contract.contactEmail,
          contactPhone: contract.contactPhone,
        }"
        submit-label="Salvar alterações"
        lock-start
        contact
        summary
        :save="save"
      />
    </section>
    <p v-else class="st__ro muted">
      {{
        contract.archivedAt
          ? "Este vínculo foi removido. Restaure para mudar o combinado."
          : "Vínculo encerrado: o combinado fica como estava."
      }}
    </p>

    <div class="st__danger">
      <section class="st__block sheet st__card" aria-labelledby="st-end">
        <h2 id="st-end" class="st__title">Encerrar vínculo</h2>
        <template v-if="contract.status === 'ended'">
          <p class="muted">
            Encerrado em
            <span class="mono">{{
              contract.endedOn ? formatDateShort(contract.endedOn) : "—"
            }}</span
            >. O cartão, os pagamentos e o histórico continuam disponíveis para consulta.
          </p>
        </template>
        <template v-else-if="!contract.archivedAt">
          <p class="muted">
            Para quando a pessoa deixar de trabalhar aqui. Nada é apagado: o cartão e os pagamentos
            ficam guardados.
          </p>
          <Button variant="danger" @click="endOpen = true">Encerrar vínculo…</Button>
        </template>
        <p v-else class="muted">Restaure o vínculo antes de encerrar.</p>
      </section>

      <section class="st__block sheet st__card" aria-labelledby="st-remove">
        <h2 id="st-remove" class="st__title">
          {{ contract.archivedAt ? "restaurar" : "remover da equipe" }}
        </h2>
        <template v-if="contract.archivedAt">
          <p class="muted">
            Removido em
            <span class="mono">{{ formatDateShort(contract.archivedAt.slice(0, 10)) }}</span
            >. Restaurar devolve a pessoa para a equipe com todo o histórico.
          </p>
          <Button icon="undo" :loading="restoring" @click="restore">Restaurar</Button>
        </template>
        <template v-else>
          <p class="muted">
            Some da equipe e do início. O histórico fica guardado e você pode restaurar em Equipe →
            removidos.
          </p>
          <Button variant="danger" icon="trash" @click="askRemove">Remover…</Button>
        </template>
      </section>
    </div>

    <Sheet v-model:open="endOpen" title="Encerrar vínculo" :subtitle="contract.workerName">
      <form id="end-form" class="stack" novalidate @submit.prevent="onEnd">
        <p v-if="endForm.formError.value" class="form-error" role="alert">
          {{ endForm.formError.value }}
        </p>
        <p>Depois de encerrar, ninguém mais anota dias nem pagamentos neste vínculo.</p>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Último dia"
          :error="endForm.errors.value.endedOn"
        >
          <DateField
            :id="id"
            v-model="endForm.values.endedOn"
            label="Último dia"
            :min="contract.startedOn"
            :invalid="invalid"
            :described-by="describedBy"
          />
        </Field>
      </form>
      <template #footer>
        <Button @click="endOpen = false">Cancelar</Button>
        <Button type="submit" form="end-form" variant="danger" :loading="endForm.submitting.value"
          >Encerrar</Button
        >
      </template>
    </Sheet>
  </div>
</template>

<style scoped>
.st {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-8);
}

.st__block {
  display: grid;
  gap: var(--s-4);
  justify-items: start;
  min-width: 0;
}

.st__block > :deep(form),
.st__block > :deep(.cf-wrap),
.st__block > :deep(.inv) {
  justify-self: stretch;
}

.st__invite,
.st__card {
  padding: var(--s-5);
}

.st__head {
  display: grid;
  gap: var(--s-2);
}

.st__title {
  font-size: var(--t-16);
  font-weight: 700;
}

.st__danger {
  display: grid;
  gap: var(--s-5);
  padding-top: var(--s-6);
  border-top: 1px dashed var(--rule);
}

.st__card {
  align-content: start;
}

@media (min-width: 640px) {
  .st__danger {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 960px) {
  .st__invite {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    align-items: start;
    column-gap: var(--s-6);
  }
  .st__invite > :deep(.inv) {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
</style>
