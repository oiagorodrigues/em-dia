<script setup lang="ts">
import {
  createPaymentSchema,
  DEFAULT_TIMEZONE,
  formatCents,
  isOpenAdvance,
  nowInZone,
  PAYMENT_KINDS,
  toYearMonth,
  YEAR_MONTH_RE,
  type PaymentKind,
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
import ChoiceField from "@/components/ui/ChoiceField.vue";
import { previousInApp, useBack } from "@/composables/back.ts";
import { useForm } from "@/composables/form.ts";
import { useInvalidate, useResource } from "@/composables/resource.ts";
import { useToastStore } from "@/stores/toast.ts";
import { isOpenAgreement, nextInstallmentCents } from "@/lib/agreement.ts";
import { isWritable } from "@/lib/contract.ts";
import { formatDateShort } from "@/lib/format.ts";
import { advanceProgress, KIND_HINT, KIND_OPTIONS, paymentFormData } from "@/lib/payments.ts";

const SUBMIT_LABEL: Record<PaymentKind, string> = {
  pay: "Registrar pagamento",
  bonus: "Registrar gratificação",
  transport: "Registrar vale-transporte",
  advance: "Registrar adiantamento",
  deduction: "Lançar desconto",
};

const SUBTITLE: Record<PaymentKind, string> = {
  pay: "Fica guardado com o comprovante, e a pessoa confirma que recebeu.",
  bonus: "Fica guardado com o comprovante, e a pessoa confirma que recebeu.",
  transport: "Fica guardado com o comprovante, e a pessoa confirma que recebeu.",
  advance: "Fica guardado com o comprovante, e a pessoa confirma que recebeu.",
  deduction: "Fica guardado no histórico dos dois lados e diminui o valor do mês.",
};

const SAVED: Record<PaymentKind, (amount: string) => string> = {
  pay: (a) => `Pagamento de ${a} registrado.`,
  bonus: (a) => `Gratificação de ${a} registrada.`,
  transport: (a) => `Vale-transporte de ${a} registrado.`,
  advance: (a) => `Adiantamento de ${a} registrado.`,
  deduction: (a) => `Desconto de ${a} lançado.`,
};

const isPaymentKind = (v: string): v is PaymentKind =>
  (PAYMENT_KINDS as readonly string[]).includes(v);

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
watch(
  contracts.data,
  (list) => {
    if (list && !list.some((c) => c.id === contractId.value)) contractId.value = list[0]?.id ?? "";
  },
  { immediate: true },
);
const contract = computed(
  () => contracts.data.value?.find((c) => c.id === contractId.value) ?? null,
);

/** `?tipo=` opens the form on a kind; `?extra=1` is the old "pagamento extra" link. */
const queryKind: PaymentKind =
  typeof route.query.tipo === "string" && isPaymentKind(route.query.tipo)
    ? route.query.tipo
    : route.query.extra === "1"
      ? "bonus"
      : "pay";

const { values, errors, formError, submitting, submit, clearError } = useForm(createPaymentSchema, {
  kind: queryAgreement ? "pay" : queryKind,
  referenceMonth: queryMonth ?? toYearMonth(today),
  paidOn: today,
  amountCents: null as number | null,
  method: (queryAgreement ? "compensation" : "pix") as PaymentMethod,
  note: "",
});
const agreementId = ref(queryAgreement ?? "");
const advanceId = ref("");
const receipt = ref<File | null>(null);
const isPay = computed(() => values.kind === "pay");
const handsMoney = computed(() => values.kind !== "deduction");

/** Prefill with what's still owed for the reference month, until the person types their own amount. */
const touchedAmount = ref(false);
const summary = useResource(
  () => ({ id: contractId.value, month: values.referenceMonth }),
  (s) => (s.id && YEAR_MONTH_RE.test(s.month) ? queryKeys.summary(s) : null),
  (s) => contractsApi.summary(s.id, s.month).then((r) => r.summary),
);
watch(
  [summary.data, isPay],
  ([s, pay]) => {
    if (!s || touchedAmount.value) return;
    values.amountCents = pay && s.balanceCents > 0 ? s.balanceCents : null;
  },
  { immediate: true },
);
/** Compensation only pays diárias/salário; other kinds go back to Pix. */
watch(isPay, (pay) => {
  if (!pay && values.method === "compensation") values.method = "pix";
  clearError("kind");
  clearError("method");
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
watch(
  agreements.data,
  (list) => {
    if (list && agreementId.value && !list.some((a) => a.id === agreementId.value))
      agreementId.value = "";
  },
  { immediate: true },
);
watch(
  agreement,
  (a) => {
    if (!a) return;
    values.amountCents = nextInstallmentCents(a);
    touchedAmount.value = true;
    clearError("amountCents");
    clearError("note");
  },
  { immediate: true },
);
watch(contractId, () => {
  agreementId.value = "";
  advanceId.value = "";
});

/** Open adiantamentos a compensation can abate, like an agreement. */
const allAdvances = useResource(
  () => (values.method === "compensation" && isPay.value ? contractId.value : ""),
  (id) => (id ? queryKeys.advances(id) : null),
  (id) => paymentsApi.advances(id).then((r) => r.advances),
);
const openAdvances = computed(() => allAdvances.data.value?.filter(isOpenAdvance) ?? []);
const advanceOptions = computed(() => [
  { value: "", label: "Nenhum" },
  ...openAdvances.value.map((a) => ({
    value: a.id,
    label: `Adiantamento de ${formatDateShort(a.paidOn)}`,
    description: advanceProgress(a).toLowerCase(),
  })),
]);
const advance = computed(() => openAdvances.value.find((a) => a.id === advanceId.value) ?? null);
watch(agreementId, (id) => id && (advanceId.value = ""));
watch(advanceId, (id) => {
  if (!id) return;
  agreementId.value = "";
  clearError("note");
  clearError("advanceId");
});

const amountHint = computed(() => {
  if (agreement.value) return `Falta ${formatCents(agreement.value.remainingCents)} neste acordo.`;
  if (advance.value) return `${advanceProgress(advance.value)} deste adiantamento.`;
  if (!isPay.value) return undefined;
  const s = summary.data.value;
  if (!s) return undefined;
  return s.balanceCents > 0
    ? `Falta pagar ${formatCents(s.balanceCents)} deste mês.`
    : "Este mês já está pago.";
});
const compensation = computed(() => isPay.value && values.method === "compensation");
const noteRequired = computed(() => compensation.value && !agreementId.value && !advanceId.value);
const submitLabel = computed(() => SUBMIT_LABEL[values.kind]);

function onSubmit(): void {
  const input = {
    ...values,
    method: handsMoney.value ? values.method : null,
    amountCents: values.amountCents ?? 0,
    note: values.note.trim() || null,
    agreementId: compensation.value && agreementId.value ? agreementId.value : undefined,
    advanceId: compensation.value && advanceId.value ? advanceId.value : undefined,
  };
  void submit(async (data) => {
    if (!contract.value) return;
    await paymentsApi.create(contract.value.id, paymentFormData(data, receipt.value));
    void invalidate.records(contract.value.id);
    toast.success(SAVED[data.kind](formatCents(data.amountCents)));
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
    <PageHeader :back="back" title="Novo pagamento" :subtitle="SUBTITLE[values.kind]" />

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
      <template #actions
        ><Button icon="refresh" @click="contracts.reload">Tentar de novo</Button></template
      >
    </EmptyState>

    <EmptyState v-else-if="contracts.data.value?.length === 0" title="Nenhum vínculo ativo.">
      Cadastre quem trabalha na sua casa para registrar pagamentos.
      <template #actions
        ><Button to="/equipe/novo" variant="primary" icon="user-plus"
          >Adicionar profissional</Button
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

        <Field
          v-slot="{ id, describedBy }"
          label="Tipo"
          :error="errors.kind"
          :hint="KIND_HINT[values.kind]"
        >
          <ChoiceField
            :id="id"
            v-model="values.kind"
            :options="KIND_OPTIONS"
            label="Tipo"
            breakpoint="lg"
            wrap
            :described-by="describedBy"
            @update:model-value="clearError('kind')"
          />
        </Field>

        <PaymentFields
          v-model:paid-on="values.paidOn"
          v-model:amount-cents="values.amountCents"
          v-model:method="values.method"
          v-model:receipt="receipt"
          :kind="values.kind"
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
              v-if="compensation && openAdvances.length > 0"
              v-slot="{ id, describedBy }"
              label="Abater de um adiantamento"
              optional
              :error="errors.advanceId"
            >
              <Select
                :id="id"
                :model-value="advanceId"
                :options="advanceOptions"
                label="Abater de um adiantamento"
                :described-by="describedBy"
                @update:model-value="(v) => (advanceId = v ?? '')"
              />
            </Field>
            <Field
              v-if="compensation"
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

        <Button type="submit" variant="primary" :loading="submitting" :disabled="!contract">{{
          submitLabel
        }}</Button>
      </form>
      <PaymentsSidePanel
        v-if="contract"
        class="np__panel"
        :contract="contract"
        :month="values.referenceMonth"
        :summary="summary.data.value ?? null"
        :loading="summary.loading.value"
        :highlight-pix="handsMoney && values.method === 'pix'"
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
