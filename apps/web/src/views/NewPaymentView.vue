<script setup lang="ts">
import {
  createPaymentSchema,
  DEFAULT_TIMEZONE,
  formatCents,
  nowInZone,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  toYearMonth,
  YEAR_MONTH_RE,
  type PaymentMethod,
} from "@emdia/shared";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { contractsApi, paymentsApi } from "@/api";
import ReceiptDrop from "@/components/feature/ReceiptDrop.vue";
import WorkerContact from "@/components/feature/WorkerContact.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Field from "@/components/ui/Field.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import MonthField from "@/components/ui/MonthField.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useForm } from "@/composables/form.ts";
import { useResource } from "@/composables/resource.ts";
import { useToastStore } from "@/stores/toast.ts";

const route = useRoute();
const router = useRouter();
const toast = useToastStore();

const today = nowInZone(DEFAULT_TIMEZONE).date;
const queryMonth =
  typeof route.query.mes === "string" && YEAR_MONTH_RE.test(route.query.mes)
    ? route.query.mes
    : null;

const contracts = useResource(
  () => 0,
  () => contractsApi.list().then((r) => r.contracts.filter((c) => c.status === "active")),
);
const contractId = ref(typeof route.query.vinculo === "string" ? route.query.vinculo : "");
watch(contracts.data, (list) => {
  if (list && !list.some((c) => c.id === contractId.value)) contractId.value = list[0]?.id ?? "";
});
const contract = computed(
  () => contracts.data.value?.find((c) => c.id === contractId.value) ?? null,
);

const { values, errors, formError, submitting, submit, clearError } = useForm(createPaymentSchema, {
  referenceMonth: queryMonth ?? toYearMonth(today),
  paidOn: today,
  amountCents: null as number | null,
  method: "pix" as PaymentMethod,
  note: "",
});
const receipt = ref<File | null>(null);

/** Prefill with what's still owed for the reference month, until the person types their own amount. */
const touchedAmount = ref(false);
const summary = useResource(
  () => (contractId.value ? `${contractId.value}|${values.referenceMonth}` : ""),
  (key) => {
    if (!key || !YEAR_MONTH_RE.test(values.referenceMonth)) return Promise.resolve(null);
    return contractsApi.summary(contractId.value, values.referenceMonth).then((r) => r.summary);
  },
);
watch(summary.data, (s) => {
  if (s && !touchedAmount.value) values.amountCents = s.balanceCents > 0 ? s.balanceCents : null;
});

const methodOptions = PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }));

function onSubmit(): void {
  const input = {
    ...values,
    amountCents: values.amountCents ?? 0,
    note: values.note.trim() || null,
  };
  void submit(async (data) => {
    if (!contract.value) return;
    const form = new FormData();
    form.append("referenceMonth", data.referenceMonth);
    form.append("paidOn", data.paidOn);
    form.append("amountCents", String(data.amountCents));
    form.append("method", data.method);
    if (data.note) form.append("note", data.note);
    if (receipt.value) form.append("receipt", receipt.value);
    await paymentsApi.create(contract.value.id, form);
    toast.success(`Pagamento de ${formatCents(data.amountCents)} registrado.`);
    await router.replace({
      name: "contract-payments",
      params: { id: contract.value.id },
      query: { mes: data.referenceMonth },
    });
  }, input);
}

const back = computed(() =>
  contractId.value
    ? { name: "contract-payments", params: { id: contractId.value } }
    : { path: "/" },
);
</script>

<template>
  <div class="np">
    <PageHeader
      :back="back"
      title="novo pagamento"
      lede="Fica guardado com o comprovante, e a pessoa confirma que recebeu."
    />

    <div v-if="contracts.loading.value && !contracts.data.value" aria-busy="true">
      <Skeleton h="48px" />
      <Skeleton h="48px" gap="20px" />
      <Skeleton h="120px" gap="20px" />
    </div>

    <EmptyState v-else-if="contracts.error.value" tone="error" title="Não deu para carregar.">
      {{ contracts.error.value.message }}
      <template #actions><Button @click="contracts.reload">tentar de novo</Button></template>
    </EmptyState>

    <EmptyState v-else-if="contracts.data.value?.length === 0" title="Nenhum vínculo ativo.">
      Cadastre quem trabalha na sua casa para registrar pagamentos.
      <template #actions
        ><Button to="/vinculos/novo" variant="primary" icon="plus"
          >adicionar profissional</Button
        ></template
      >
    </EmptyState>

    <form v-else class="np__form" novalidate @submit.prevent="onSubmit">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

      <Field v-if="(contracts.data.value?.length ?? 0) > 1" v-slot="{ id }" label="Para quem">
        <select :id="id" v-model="contractId" class="input">
          <option v-for="c in contracts.data.value" :key="c.id" :value="c.id">
            {{ c.workerName }}
          </option>
        </select>
      </Field>
      <p v-else-if="contract" class="np__who">
        <span class="label">para</span> <strong>{{ contract.workerName }}</strong>
      </p>

      <div class="np__two">
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Mês de referência"
          :error="errors.referenceMonth"
        >
          <MonthField
            :id="id"
            v-model="values.referenceMonth"
            label="Mês de referência"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="clearError('referenceMonth')"
          />
        </Field>
        <Field v-slot="{ id, invalid, describedBy }" label="Pago em" :error="errors.paidOn">
          <input
            :id="id"
            v-model="values.paidOn"
            class="input"
            type="date"
            :max="today"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            @input="clearError('paidOn')"
          />
        </Field>
      </div>

      <Field
        v-slot="{ id, invalid, describedBy }"
        label="Valor"
        :error="errors.amountCents ? 'Informe o valor' : null"
        :hint="
          summary.data.value
            ? summary.data.value.balanceCents > 0
              ? `Falta pagar ${formatCents(summary.data.value.balanceCents)} deste mês.`
              : 'Este mês já está pago.'
            : undefined
        "
      >
        <MoneyInput
          :id="id"
          v-model="values.amountCents"
          :invalid="invalid"
          :described-by="describedBy"
          @update:model-value="
            touchedAmount = true;
            clearError('amountCents');
          "
        />
      </Field>

      <fieldset class="np__set">
        <legend class="label">Como pagou</legend>
        <Segmented v-model="values.method" :options="methodOptions" label="Como pagou" wrap />
        <WorkerContact
          v-if="values.method === 'pix' && contract?.workerPixKey"
          class="np__pix"
          :pix-key="contract.workerPixKey"
          compact
        />
      </fieldset>

      <fieldset class="np__set">
        <legend class="label">Comprovante <span class="np__opt">opcional</span></legend>
        <ReceiptDrop v-model="receipt" />
      </fieldset>

      <Field v-slot="{ id, invalid, describedBy }" label="Observação" optional :error="errors.note">
        <textarea
          :id="id"
          v-model="values.note"
          class="input"
          rows="2"
          maxlength="500"
          :aria-invalid="invalid || undefined"
          :aria-describedby="describedBy"
        />
      </Field>

      <Button type="submit" variant="primary" :loading="submitting" :disabled="!contract"
        >registrar pagamento</Button
      >
    </form>
  </div>
</template>

<style scoped>
.np {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.np__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.np__who {
  display: flex;
  gap: var(--s-2);
  align-items: baseline;
  font-size: var(--t-20);
}

.np__two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

@media (min-width: 520px) {
  .np__two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
  }
}

.np__set {
  border: 0;
  padding: 0;
  min-width: 0;
}

.np__set legend {
  padding: 0;
  margin-bottom: var(--s-3);
}

.np__pix {
  margin-top: var(--s-3);
}

.np__opt {
  margin-left: var(--s-1);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  color: var(--ink-3);
}

.np__form > :deep(.btn) {
  justify-self: start;
  min-width: 220px;
}

select.input {
  background-image: none;
}
</style>
