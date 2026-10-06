<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  endContractSchema,
  nowInZone,
  type CreateContractInput,
} from "@emdia/shared";
import { ref } from "vue";
import { contractsApi, errorMessage } from "@/api";
import ContractForm from "@/components/feature/ContractForm.vue";
import InviteCard from "@/components/feature/InviteCard.vue";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import Sheet from "@/components/ui/Sheet.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useForm } from "@/composables/form.ts";
import { formatDateShort } from "@/lib/format.ts";
import { useToastStore } from "@/stores/toast.ts";

const toast = useToastStore();
const { contract, replaceContract } = useContract();

async function save(data: CreateContractInput): Promise<void> {
  const { householdId: _, ...patch } = data;
  const { contract: updated } = await contractsApi.update(contract.value.id, patch);
  replaceContract(updated);
  toast.success("Combinado atualizado.");
}

const invite = ref<{ code: string; expiresAt: string } | null>(null);
const inviting = ref(false);
async function generate(): Promise<void> {
  inviting.value = true;
  try {
    invite.value = await contractsApi.invite(contract.value.id);
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    inviting.value = false;
  }
}

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
    <section class="st__block" aria-labelledby="st-invite">
      <h2 id="st-invite" class="section-title">convite</h2>
      <template v-if="contract.workerId">
        <p class="muted">
          {{ contract.workerName }} já entrou no vínculo e bate o ponto pelo próprio celular.
        </p>
      </template>
      <template v-else-if="contract.status === 'active'">
        <InviteCard
          v-if="invite"
          :code="invite.code"
          :expires-at="invite.expiresAt"
          :worker-name="contract.workerName"
        />
        <p class="muted">
          {{
            invite
              ? "Gerar outro código invalida o anterior."
              : "Ainda ninguém entrou. Gere um código e mande para a pessoa."
          }}
        </p>
        <Button
          :variant="invite ? 'secondary' : 'primary'"
          icon="key"
          :loading="inviting"
          @click="generate"
        >
          {{ invite ? "gerar outro código" : "gerar código de convite" }}
        </Button>
      </template>
    </section>

    <section v-if="contract.status === 'active'" class="st__block" aria-labelledby="st-edit">
      <h2 id="st-edit" class="section-title">combinado</h2>
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
        }"
        submit-label="salvar alterações"
        lock-start
        :save="save"
      />
    </section>

    <section class="st__block st__danger" aria-labelledby="st-end">
      <h2 id="st-end" class="section-title">encerrar vínculo</h2>
      <template v-if="contract.status === 'ended'">
        <p class="muted">
          Encerrado em
          <span class="mono">{{ contract.endedOn ? formatDateShort(contract.endedOn) : "—" }}</span
          >. O cartão, os pagamentos e o histórico continuam disponíveis para consulta.
        </p>
      </template>
      <template v-else>
        <p class="muted">
          Para quando a pessoa deixar de trabalhar aqui. Nada é apagado: o cartão e os pagamentos
          ficam guardados.
        </p>
        <Button variant="danger" @click="endOpen = true">encerrar vínculo…</Button>
      </template>
    </section>

    <Sheet v-model:open="endOpen" title="encerrar vínculo" :subtitle="contract.workerName">
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
          <input
            :id="id"
            v-model="endForm.values.endedOn"
            class="input"
            type="date"
            :min="contract.startedOn"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
          />
        </Field>
      </form>
      <template #footer>
        <Button @click="endOpen = false">cancelar</Button>
        <Button type="submit" form="end-form" variant="danger" :loading="endForm.submitting.value"
          >encerrar</Button
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
}

.st__block > :deep(form),
.st__block > :deep(.inv) {
  justify-self: stretch;
}

.st__danger {
  padding-top: var(--s-6);
  border-top: 1px dashed var(--rule);
}
</style>
