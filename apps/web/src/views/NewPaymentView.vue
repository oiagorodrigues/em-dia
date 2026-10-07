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
import { queryKeys } from "@/api/keys.ts";
import PaymentFields from "@/components/feature/PaymentFields.vue";
import PaymentsSidePanel from "@/components/feature/PaymentsSidePanel.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Field from "@/components/ui/Field.vue";
import MonthField from "@/components/ui/MonthField.vue";
import Select from "@/components/ui/Select.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import SkeletonForm from "@/components/ui/SkeletonForm.vue";
import SkeletonLedger from "@/components/ui/SkeletonLedger.vue";
import Toggle from "@/components/ui/Toggle.vue";
import { previousInApp, useBack } from "@/composables/back.ts";
import { useForm } from "@/composables/form.ts";
import { useInvalidate, useResource } from "@/composables/resource.ts";
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

const allContracts = useResource(
  () => null,
  queryKeys.contracts,
  () => contractsApi.list().then((r) => r.contracts),
);
const contracts = {
  ...allContracts,
  data: computed(() => allContracts.data.value?.filter(isWritable)),
};
const invalidate = useInvalidate();
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
  isExtra: route.query.extra === "1",
});
const agreementId = ref(queryAgreement ?? "");
const receipt = ref<File | null>(null);

/** Prefill with what's still owed for the reference month, until the person types their own amount. */
const touchedAmount = ref(false);
const summary = useResource(
  () => ({ id: contractId.value, month: values.referenceMonth }),
  (s) => (s.id && YEAR_MONTH_RE.test(s.month) ? queryKeys.summary(s) : null),
  (s) => contractsApi.summary(s.id, s.month).then((r) => r.summary),
);
watch(summary.data, (s) => {
  if (s && !touchedAmount.value) values.amountCents = s.balanceCents > 0 ? s.balanceCents : null;
});

const contractOptions = computed(() =>
  (contracts.data.value ?? []).map((c) => ({ value: c.id, label: c.workerName })),
);

/** Open agreements (accepted or still waiting for the worker) a compensation can pay down. */
const allAgreements = useResource(
  () => (values.method === "compensation" ? contractId.value : ""),
  (id) => (id ? queryKeys.agreements(id) : null),
  (id) => agreementsApi.list(id, { archived: true }).then((r) => r.agreements),
);
const agreements = {
  ...allAgreements,
  data: computed(() => allAgreements.data.value?.filter(isOpenAgreement)),
};
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
    isExtra: values.method !== "compensation" && values.isExtra,
  };
  void submit(async (data) => {
    if (!contract.value) return;
    await paymentsApi.create(contract.value.id, paymentFormData(data, receipt.value));
    void invalidate.records(contract.value.id);
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

    <div
      v-if="contracts.loading.value && !contracts.data.value"
      aria-busy="true"
      class="np__layout"
    >
      <SkeletonForm :fields="['input', 'two', 'input', 'choice', 'drop', 'area']" />
      <div class="np__panel np__skel">
        <span class="np__skelwho">
          <Skeleton w="44px" h="44px" round />
          <span class="np__skellines">
            <Skeleton w="60%" h="16px" />
            <Skeleton w="40%" h="12px" />
          </span>
        </span>
        <Skeleton w="45%" h="12px" />
        <SkeletonLedger />
        <Skeleton h="88px" />
      </div>
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

        <Toggle
          v-if="values.method !== 'compensation'"
          v-model="values.isExtra"
          label="Pagamento extra"
          hint="Fora do valor do mês, como uma festa ou um sábado. Aparece também em Extras e não mexe no saldo do mês."
        />

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

.np__skel {
  display: grid;
  gap: var(--s-5);
  padding: var(--s-6);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  box-shadow: var(--shadow-1);
}

.np__skelwho {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.np__skellines {
  flex: 1;
  display: grid;
  gap: 6px;
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
