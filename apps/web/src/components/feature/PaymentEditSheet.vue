<script setup lang="ts">
import {
  createPaymentSchema,
  DEFAULT_TIMEZONE,
  formatCents,
  formatYearMonth,
  nowInZone,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type Payment,
  type PaymentMethod,
} from "@emdia/shared";
import { computed, ref, watch } from "vue";
import { agreementsApi, paymentsApi } from "@/api";
import Button from "@/components/ui/Button.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import DateField from "@/components/ui/DateField.vue";
import Field from "@/components/ui/Field.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import MonthField from "@/components/ui/MonthField.vue";
import Select from "@/components/ui/Select.vue";
import Sheet from "@/components/ui/Sheet.vue";
import Toggle from "@/components/ui/Toggle.vue";
import { useForm } from "@/composables/form.ts";
import { useResource } from "@/composables/resource.ts";
import { isOpenAgreement } from "@/lib/agreement.ts";

const open = defineModel<boolean>("open", { required: true });
const { payment, subtitle } = defineProps<{ payment: Payment | null; subtitle?: string }>();
const emit = defineEmits<{ saved: [payment: Payment] }>();

const today = nowInZone(DEFAULT_TIMEZONE).date;

const { values, errors, formError, submitting, submit, clearError } = useForm(createPaymentSchema, {
  referenceMonth: "",
  paidOn: today,
  amountCents: null as number | null,
  method: "pix" as PaymentMethod,
  note: "",
  isExtra: false,
});
const agreementId = ref("");

watch(
  () => [open.value, payment?.id] as const,
  ([isOpen]) => {
    if (!isOpen || !payment) return;
    values.referenceMonth = payment.referenceMonth;
    values.paidOn = payment.paidOn;
    values.amountCents = payment.amountCents;
    values.method = payment.method;
    values.note = payment.note ?? "";
    values.isExtra = payment.isExtra;
    agreementId.value = payment.agreementId ?? "";
    formError.value = null;
    for (const key of Object.keys(errors.value)) clearError(key);
  },
  { immediate: true },
);

/** Open agreements plus the one this payment already pays down (it may be settled by it). */
const agreements = useResource(
  () => (open.value && payment && values.method === "compensation" ? payment.contractId : ""),
  (id) =>
    id
      ? agreementsApi
          .list(id)
          .then((r) =>
            r.agreements.filter((a) => isOpenAgreement(a) || a.id === payment?.agreementId),
          )
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

const methodOptions = PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }));
const noteRequired = computed(() => values.method === "compensation" && !agreementId.value);
const reopens = computed(
  () =>
    !!payment?.acknowledgedAt &&
    (values.referenceMonth !== payment.referenceMonth ||
      values.paidOn !== payment.paidOn ||
      values.amountCents !== payment.amountCents ||
      values.method !== payment.method ||
      (values.method === "compensation" ? agreementId.value || null : null) !==
        payment.agreementId),
);

watch(
  () => values.method,
  (m) => {
    if (m === "compensation") values.isExtra = false;
  },
);

function onSubmit(): void {
  if (!payment) return;
  const compensation = values.method === "compensation";
  const input = {
    referenceMonth: values.referenceMonth,
    paidOn: values.paidOn,
    amountCents: values.amountCents ?? 0,
    method: values.method,
    note: values.note.trim() || null,
    agreementId: compensation && agreementId.value ? agreementId.value : null,
    isExtra: !compensation && values.isExtra,
  };
  void submit(async (data) => {
    const { payment: saved } = await paymentsApi.update(payment.contractId, payment.id, {
      ...data,
      agreementId: data.agreementId ?? null,
    });
    open.value = false;
    emit("saved", saved);
  }, input);
}
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Editar pagamento"
    :subtitle="
      subtitle ?? (payment ? `referente a ${formatYearMonth(payment.referenceMonth)}` : undefined)
    "
  >
    <form id="payment-edit-form" class="stack" novalidate @submit.prevent="onSubmit">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
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
        <Field v-slot="{ id, invalid, describedBy }" label="Pago em" :error="errors.paidOn">
          <DateField
            :id="id"
            v-model="values.paidOn"
            label="Pago em"
            :max="today"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="clearError('paidOn')"
          />
        </Field>
      </div>

      <Field
        v-slot="{ id, invalid, describedBy }"
        label="Valor"
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

      <Field v-slot="{ id }" label="Como pagou" :error="errors.method">
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
        v-if="values.method === 'compensation'"
        v-slot="{ id, describedBy }"
        label="Abater de um acordo"
        optional
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

      <Toggle
        v-if="values.method !== 'compensation'"
        v-model="values.isExtra"
        label="Pagamento extra"
        hint="Fora do valor do mês, como uma festa ou um sábado. Aparece também em Extras."
      />

      <p v-if="reopens" class="pe__warn" role="status">
        A confirmação de recebimento volta para “aguardando”, porque o valor ou a data mudou.
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
