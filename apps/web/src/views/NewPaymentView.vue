<script setup lang="ts">
import {
  createPaymentSchema,
  DEFAULT_TIMEZONE,
  formatCents,
  nowInZone,
  toYearMonth,
  YEAR_MONTH_RE,
  type PaymentMethod,
} from "@emdia/shared";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { agreementsApi, contractsApi, paymentsApi } from "@/api";
import PaymentFields from "@/components/feature/PaymentFields.vue";
import PaymentsSidePanel from "@/components/feature/PaymentsSidePanel.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Field from "@/components/ui/Field.vue";
import MonthField from "@/components/ui/MonthField.vue";
import Select from "@/components/ui/Select.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { previousInApp, useBack } from "@/composables/back.ts";
import { useForm } from "@/composables/form.ts";
import { useResource } from "@/composables/resource.ts";
import { useToastStore } from "@/stores/toast.ts";
import { isOpenAgreement, nextInstallmentCents } from "@/lib/agreement.ts";
import { isWritable } from "@/lib/contract.ts";
import { paymentFormData } from "@/lib/payments.ts";

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
  () => contractsApi.list().then((r) => r.contracts.filter(isWritable)),
);
const queryAgreement = typeof route.query.acordo === "string" ? route.query.acordo : null;
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
  method: (queryAgreement ? "compensation" : "pix") as PaymentMethod,
  note: "",
});
const agreementId = ref(queryAgreement ?? "");
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

const contractOptions = computed(() =>
  (contracts.data.value ?? []).map((c) => ({ value: c.id, label: c.workerName })),
);

/** Open agreements (accepted or still waiting for the worker) a compensation can pay down. */
const agreements = useResource(
  () => (values.method === "compensation" ? contractId.value : ""),
  (id) =>
    id
      ? agreementsApi.list(id).then((r) => r.agreements.filter(isOpenAgreement))
      : Promise.resolve([]),
);
const agreementOptions = computed(() => [
  { value: "", label: "Nenhum: compensação avulsa" },
  ...(agreements.data.value ?? []).map((a) => ({
    value: a.id,
    label: a.description,
    description: `falta ${formatCents(a.remainingCents)} de ${formatCents(a.totalCents)}`,
  })),
]);
const agreement = computed(
  () => agreements.data.value?.find((a) => a.id === agreementId.value) ?? null,
);
watch(agreements.data, (list) => {
  if (list && agreementId.value && !list.some((a) => a.id === agreementId.value))
    agreementId.value = "";
});
watch(agreement, (a) => {
  if (!a) return;
  values.amountCents = nextInstallmentCents(a);
  touchedAmount.value = true;
  clearError("amountCents");
  clearError("note");
});
watch(contractId, () => (agreementId.value = ""));

const amountHint = computed(() => {
  if (agreement.value) return `Falta ${formatCents(agreement.value.remainingCents)} neste acordo.`;
  const s = summary.data.value;
  if (!s) return undefined;
  return s.balanceCents > 0
    ? `Falta pagar ${formatCents(s.balanceCents)} deste mês.`
    : "Este mês já está pago.";
});
const noteRequired = computed(() => values.method === "compensation" && !agreementId.value);

function onSubmit(): void {
  const input = {
    ...values,
    amountCents: values.amountCents ?? 0,
    note: values.note.trim() || null,
    agreementId:
      values.method === "compensation" && agreementId.value ? agreementId.value : undefined,
  };
  void submit(async (data) => {
    if (!contract.value) return;
    await paymentsApi.create(contract.value.id, paymentFormData(data, receipt.value));
    toast.success(`Pagamento de ${formatCents(data.amountCents)} registrado.`);
    // Back to where the form was opened from; a direct visit lands on the person's payments.
    if (previousInApp()) router.back();
    else
      await router.replace({
        name: "contract-payments",
        params: { id: contract.value.id },
        query: { mes: data.referenceMonth },
      });
  }, input);
}

const { to: back } = useBack(
  typeof route.query.vinculo === "string"
    ? { name: "contract-payments", params: { id: route.query.vinculo } }
    : { path: "/pagamentos" },
);
</script>

<template>
  <div class="np">
    <PageHeader
      :back="back"
      title="Novo pagamento"
      subtitle="Fica guardado com o comprovante, e a pessoa confirma que recebeu."
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
        ><Button to="/equipe/novo" variant="primary" icon="plus"
          >adicionar profissional</Button
        ></template
      >
    </EmptyState>

    <div v-else class="np__layout">
      <form class="np__form" novalidate @submit.prevent="onSubmit">
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

        <Field v-if="(contracts.data.value?.length ?? 0) > 1" v-slot="{ id }" label="Para quem">
          <Select
            :id="id"
            :model-value="contractId"
            :options="contractOptions"
            label="Para quem"
            @update:model-value="(v) => v && (contractId = v)"
          />
        </Field>
        <p v-else-if="contract" class="np__who">
          <span class="label">para</span> <strong>{{ contract.workerName }}</strong>
        </p>

        <PaymentFields
          v-model:paid-on="values.paidOn"
          v-model:amount-cents="values.amountCents"
          v-model:method="values.method"
          v-model:receipt="receipt"
          :errors="errors"
          :today="today"
          :amount-hint="amountHint"
          @clear="clearError"
          @amount-input="touchedAmount = true"
        >
          <template #beside-date>
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
          </template>
          <template #after-method>
            <Field
              v-if="values.method === 'compensation'"
              v-slot="{ id, describedBy }"
              label="Abater de um acordo"
              optional
              :hint="
                agreements.data.value?.length === 0
                  ? 'Nenhum acordo em aberto. Crie um na aba Acordos da pessoa, ou descreva a compensação abaixo.'
                  : 'A parcela do acordo vem preenchida no valor.'
              "
            >
              <Select
                :id="id"
                :model-value="agreementId"
                :options="agreementOptions"
                label="Abater de um acordo"
                :described-by="describedBy"
                :disabled="agreements.loading.value"
                @update:model-value="(v) => (agreementId = v ?? '')"
              />
            </Field>
          </template>
        </PaymentFields>

        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Observação"
          :optional="!noteRequired"
          :error="errors.note"
          :hint="
            noteRequired
              ? 'Diga com o que foi compensado, por exemplo: “desconto do celular”.'
              : undefined
          "
        >
          <textarea
            :id="id"
            v-model="values.note"
            class="input"
            rows="2"
            maxlength="500"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            @input="clearError('note')"
          />
        </Field>

        <Button type="submit" variant="primary" :loading="submitting" :disabled="!contract"
          >registrar pagamento</Button
        >
      </form>
      <PaymentsSidePanel
        v-if="contract"
        class="np__panel"
        :contract="contract"
        :month="values.referenceMonth"
        :summary="summary.data.value ?? null"
        :loading="summary.loading.value"
        :highlight-pix="values.method === 'pix'"
      />
    </div>
  </div>
</template>

<style scoped>
.np {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.np__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

@media (min-width: 960px) {
  .np__layout {
    grid-template-columns: minmax(0, var(--form)) minmax(280px, 380px);
    column-gap: var(--s-8);
    align-items: start;
  }
  .np__panel {
    position: sticky;
    top: var(--s-6);
  }
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

.np__form > :deep(.btn) {
  justify-self: start;
  min-width: 220px;
}

select.input {
  background-image: none;
}
</style>
