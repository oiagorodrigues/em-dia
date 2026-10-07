<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  formatCents,
  formatYearMonth,
  isOpenAdvance,
  nowInZone,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  updatePaymentSchema,
  type Payment,
  type PaymentKind,
  type PaymentMethod,
} from "@emdia/shared";
import { computed, ref, watch } from "vue";
import { agreementsApi, paymentsApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import Button from "@/components/ui/Button.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import DateField from "@/components/ui/DateField.vue";
import Field from "@/components/ui/Field.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import MonthField from "@/components/ui/MonthField.vue";
import Select from "@/components/ui/Select.vue";
import Sheet from "@/components/ui/Sheet.vue";
import { useForm } from "@/composables/form.ts";
import { useResource } from "@/composables/resource.ts";
import { isOpenAgreement } from "@/lib/agreement.ts";
import { formatDateShort } from "@/lib/format.ts";
import { advanceProgress, KIND_HINT, KIND_OPTIONS } from "@/lib/payments.ts";

const open = defineModel<boolean>("open", { required: true });
const { payment, subtitle } = defineProps<{ payment: Payment | null; subtitle?: string }>();
const emit = defineEmits<{ saved: [payment: Payment] }>();

const today = nowInZone(DEFAULT_TIMEZONE).date;

/** "" is "sem forma": a gratificação migrated from Extras whose money went out in another payment. */
type MethodChoice = PaymentMethod | "";

const { values, errors, formError, submitting, submit, clearError } = useForm(updatePaymentSchema, {
  kind: "pay" as PaymentKind,
  referenceMonth: "",
  paidOn: today,
  amountCents: null as number | null,
  method: "pix" as MethodChoice,
  note: "",
});
const agreementId = ref("");
const advanceId = ref("");

watch(
  () => [open.value, payment?.id] as const,
  ([isOpen]) => {
    if (!isOpen || !payment) return;
    values.kind = payment.kind;
    values.referenceMonth = payment.referenceMonth;
    values.paidOn = payment.paidOn;
    values.amountCents = payment.amountCents;
    values.method = payment.method ?? (payment.kind === "deduction" ? "pix" : "");
    values.note = payment.note ?? "";
    agreementId.value = payment.agreementId ?? "";
    advanceId.value = payment.advanceId ?? "";
    formError.value = null;
    for (const key of Object.keys(errors.value)) clearError(key);
  },
  { immediate: true },
);

const handsMoney = computed(() => values.kind !== "deduction");
const compensation = computed(() => values.kind === "pay" && values.method === "compensation");
/** An adiantamento with days abated keeps its type, and its amount can't go under them. */
const abated = computed(() => payment?.settledCents ?? 0);
const kindOptions = computed(() =>
  abated.value > 0 ? KIND_OPTIONS.filter((o) => o.value === "advance") : KIND_OPTIONS,
);
const methodOptions = computed(() => [
  ...(payment?.method === null && payment.kind !== "deduction"
    ? [{ value: "" as MethodChoice, label: "Sem forma" }]
    : []),
  ...PAYMENT_METHODS.filter((m) => values.kind === "pay" || m !== "compensation").map((m) => ({
    value: m as MethodChoice,
    label: PAYMENT_METHOD_LABEL[m],
  })),
]);
watch(
  () => values.kind,
  (kind) => {
    if (kind !== "pay" && values.method === "compensation") values.method = "pix";
  },
);

/** Open agreements plus the one this payment already pays down (it may be settled by it). */
const agreements = useResource(
  () => (open.value && payment && compensation.value ? payment.contractId : ""),
  (id) => (id ? queryKeys.agreements(id) : null),
  (id) => agreementsApi.list(id).then((r) => r.agreements),
);
const agreementOptions = computed(() => [
  { value: "", label: "Nenhum: compensação avulsa" },
  ...(agreements.data.value ?? [])
    .filter((a) => isOpenAgreement(a) || a.id === payment?.agreementId)
    .map((a) => ({
      value: a.id,
      label: a.description,
      description: `falta ${formatCents(a.remainingCents)} de ${formatCents(a.totalCents)}`,
    })),
]);

const advances = useResource(
  () => (open.value && payment && compensation.value ? payment.contractId : ""),
  (id) => (id ? queryKeys.advances(id) : null),
  (id) => paymentsApi.advances(id).then((r) => r.advances),
);
const advanceOptions = computed(() => [
  { value: "", label: "Nenhum" },
  ...(advances.data.value ?? [])
    .filter((a) => isOpenAdvance(a) || a.id === payment?.advanceId)
    .map((a) => ({
      value: a.id,
      label: `Adiantamento de ${formatDateShort(a.paidOn)}`,
      description: advanceProgress(a).toLowerCase(),
    })),
]);
watch(agreementId, (id) => id && (advanceId.value = ""));
watch(advanceId, (id) => id && (agreementId.value = ""));

const noteRequired = computed(() => compensation.value && !agreementId.value && !advanceId.value);
const nextMethod = computed(() => (handsMoney.value && values.method ? values.method : null));
const reopens = computed(
  () =>
    !!payment?.acknowledgedAt &&
    (!handsMoney.value ||
      values.kind !== payment.kind ||
      values.referenceMonth !== payment.referenceMonth ||
      values.paidOn !== payment.paidOn ||
      values.amountCents !== payment.amountCents ||
      nextMethod.value !== payment.method ||
      (compensation.value ? agreementId.value || null : null) !== payment.agreementId ||
      (compensation.value ? advanceId.value || null : null) !== payment.advanceId),
);

function onSubmit(): void {
  if (!payment) return;
  const input = {
    kind: values.kind,
    referenceMonth: values.referenceMonth,
    paidOn: values.paidOn,
    amountCents: values.amountCents ?? 0,
    method: nextMethod.value,
    note: values.note.trim() || null,
    agreementId: compensation.value && agreementId.value ? agreementId.value : null,
    advanceId: compensation.value && advanceId.value ? advanceId.value : null,
  };
  void submit(async (data) => {
    const { payment: saved } = await paymentsApi.update(payment.contractId, payment.id, data);
    open.value = false;
    emit("saved", saved);
  }, input);
}
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Editar lançamento"
    :subtitle="
      subtitle ?? (payment ? `referente a ${formatYearMonth(payment.referenceMonth)}` : undefined)
    "
  >
    <form id="payment-edit-form" class="stack" novalidate @submit.prevent="onSubmit">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

      <Field
        v-slot="{ id, describedBy }"
        label="Tipo"
        :error="errors.kind"
        :hint="
          abated > 0
            ? `Já tem ${formatCents(abated)} em dias abatidos, então continua adiantamento.`
            : KIND_HINT[values.kind]
        "
      >
        <ChoiceField
          :id="id"
          v-model="values.kind"
          :options="kindOptions"
          label="Tipo"
          breakpoint="lg"
          wrap
          :described-by="describedBy"
          @update:model-value="clearError('kind')"
        />
      </Field>

      <div class="pe__two">
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
        <Field
          v-slot="{ id, invalid, describedBy }"
          :label="handsMoney ? 'Pago em' : 'Data'"
          :error="errors.paidOn"
        >
          <DateField
            :id="id"
            v-model="values.paidOn"
            :label="handsMoney ? 'Pago em' : 'Data'"
            :max="today"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="clearError('paidOn')"
          />
        </Field>
      </div>

      <Field
        v-slot="{ id, invalid, describedBy }"
        :label="handsMoney ? 'Valor' : 'Valor do desconto'"
        :error="
          errors.amountCents ? (values.amountCents ? errors.amountCents : 'Informe o valor') : null
        "
      >
        <MoneyInput
          :id="id"
          v-model="values.amountCents"
          :invalid="invalid"
          :described-by="describedBy"
          @update:model-value="clearError('amountCents')"
        />
      </Field>

      <Field v-if="handsMoney" v-slot="{ id }" label="Como pagou" :error="errors.method">
        <ChoiceField
          :id="id"
          v-model="values.method"
          :options="methodOptions"
          label="Como pagou"
          wrap
          @update:model-value="clearError('method')"
        />
      </Field>

      <Field
        v-if="compensation && advanceOptions.length > 1"
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
          :disabled="advances.loading.value"
          @update:model-value="(v) => (advanceId = v ?? '')"
        />
      </Field>

      <Field v-if="compensation" v-slot="{ id, describedBy }" label="Abater de um acordo" optional>
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

      <Field
        v-slot="{ id, invalid, describedBy }"
        label="Observação"
        :optional="!noteRequired"
        :error="errors.note"
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

      <p v-if="reopens" class="pe__warn" role="status">
        {{
          handsMoney
            ? "A confirmação de recebimento volta para “aguardando”, porque o valor ou a data mudou."
            : "Um desconto não tem “recebi”: a confirmação deste lançamento sai."
        }}
      </p>
    </form>
    <template #footer>
      <Button @click="open = false">Cancelar</Button>
      <Button type="submit" form="payment-edit-form" variant="primary" :loading="submitting"
        >Salvar</Button
      >
    </template>
  </Sheet>
</template>

<style scoped>
.pe__two {
  display: grid;
  gap: var(--s-4);
}

.pe__warn {
  font-size: var(--t-14);
  color: var(--amber-ink);
}

@media (min-width: 520px) {
  .pe__two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
  }
}
</style>
