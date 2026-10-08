<script setup lang="ts">
import type { Contract, CreateContractInput } from "@emdia/shared";
import { contractsApi } from "@/api";
import Sheet from "@/components/ui/Sheet.vue";
import { useToastStore } from "@/stores/toast.ts";
import ContractForm from "./ContractForm.vue";

const open = defineModel<boolean>("open", { required: true });
const { contract } = defineProps<{ contract: Contract }>();
const emit = defineEmits<{ saved: [contract: Contract] }>();
const toast = useToastStore();

async function save(data: CreateContractInput): Promise<void> {
  const { householdId: _, ...patch } = data;
  const { contract: updated } = await contractsApi.update(contract.id, patch);
  emit("saved", updated);
  toast.success("Combinado atualizado.");
  open.value = false;
}
</script>

<template>
  <Sheet
    v-model:open="open"
    wide
    :title="`Editar ${contract.workerName}`"
    subtitle="Combinado e contato"
  >
    <div class="ce">
      <section v-if="contract.workerId" class="ce__who" aria-labelledby="ce-who">
        <h3 id="ce-who" class="ce__title">Contato de {{ contract.workerName }}</h3>
        <p class="muted">Vem do cadastro de {{ contract.workerName }}, que pode mudar no perfil.</p>
        <dl class="ce__contact">
          <div>
            <dt class="label">E-mail</dt>
            <dd>
              <a v-if="contract.workerEmail" :href="`mailto:${contract.workerEmail}`">{{
                contract.workerEmail
              }}</a>
              <span v-else class="muted">não informado</span>
            </dd>
          </div>
          <div>
            <dt class="label">Telefone</dt>
            <dd>
              <a
                v-if="contract.workerPhone"
                :href="`tel:${contract.workerPhone.replace(/\D/g, '')}`"
                class="mono"
                >{{ contract.workerPhone }}</a
              >
              <span v-else class="muted">não informado</span>
            </dd>
          </div>
        </dl>
      </section>
      <ContractForm
        v-if="open"
        :key="contract.id"
        :initial="{
          workerName: contract.workerName,
          occupation: contract.occupation,
          payType: contract.payType,
          rateCents: contract.rateCents,
          schedule: contract.schedule,
          deductAbsences: contract.deductAbsences,
          nightBonus: contract.nightBonus,
          expectedStart: contract.expectedStart,
          expectedEnd: contract.expectedEnd,
          startedOn: contract.startedOn,
          contactEmail: contract.contactEmail,
          contactPhone: contract.contactPhone,
        }"
        submit-label="Salvar alterações"
        lock-start
        :contact="!contract.workerId"
        :save="save"
      />
    </div>
  </Sheet>
</template>

<style scoped>
.ce {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.ce__who {
  display: grid;
  gap: var(--s-2);
  padding: var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  background: var(--surface);
}

.ce__title {
  font-size: var(--t-16);
  font-weight: 700;
}

.ce__contact {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3) var(--s-8);
  margin-top: var(--s-1);
}

.ce__contact > div {
  display: grid;
  gap: 2px;
}

.ce__contact dd {
  font-size: var(--t-14);
  overflow-wrap: anywhere;
}
</style>
