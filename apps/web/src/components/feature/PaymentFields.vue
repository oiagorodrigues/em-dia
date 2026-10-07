<script setup lang="ts">
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type IsoDate,
  type PaymentKind,
  type PaymentMethod,
} from "@emdia/shared";
import { computed } from "vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import DateField from "@/components/ui/DateField.vue";
import Field from "@/components/ui/Field.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import ReceiptDrop from "./ReceiptDrop.vue";

/** Pago em, valor, como pagou and comprovante, shared by "novo pagamento" and the day editor. */
const paidOn = defineModel<string>("paidOn", { required: true });
const amountCents = defineModel<number | null>("amountCents", { required: true });
const method = defineModel<PaymentMethod>("method", { required: true });
const receipt = defineModel<File | null>("receipt", { required: true });
const {
  errors,
  today,
  amountHint,
  disabled = false,
  kind = "pay",
} = defineProps<{
  errors: Record<string, string>;
  today: IsoDate;
  amountHint?: string;
  disabled?: boolean;
  /** A desconto hands no money: no method, no receipt, and its date is just "Data". */
  kind?: PaymentKind;
}>();
const emit = defineEmits<{ clear: [field: string]; amountInput: [] }>();

/** Compensation only pays down diárias/salário (an agreement or an adiantamento). */
const methodOptions = computed(() =>
  PAYMENT_METHODS.filter((m) => kind === "pay" || m !== "compensation").map((m) => ({
    value: m,
    label: PAYMENT_METHOD_LABEL[m],
  })),
);
const handsMoney = computed(() => kind !== "deduction");
const dateLabel = computed(() => (handsMoney.value ? "Pago em" : "Data"));

function onAmount(): void {
  emit("amountInput");
  emit("clear", "amountCents");
}
</script>

<template>
  <div class="pf__two">
    <slot name="beside-date" />
    <Field v-slot="{ id, invalid, describedBy }" :label="dateLabel" :error="errors.paidOn">
      <DateField
        :id="id"
        v-model="paidOn"
        :label="dateLabel"
        :max="today"
        :disabled="disabled"
        :invalid="invalid"
        :described-by="describedBy"
        @update:model-value="emit('clear', 'paidOn')"
      />
    </Field>
  </div>

  <Field
    v-slot="{ id, invalid, describedBy }"
    :label="handsMoney ? 'Valor' : 'Valor do desconto'"
    :error="errors.amountCents ? (amountCents ? errors.amountCents : 'Informe o valor') : null"
    :hint="amountHint"
  >
    <MoneyInput
      :id="id"
      v-model="amountCents"
      :invalid="invalid"
      :described-by="describedBy"
      @update:model-value="onAmount"
    />
  </Field>

  <template v-if="handsMoney">
    <Field v-slot="{ id }" label="Como pagou" :error="errors.method">
      <ChoiceField
        :id="id"
        v-model="method"
        :options="methodOptions"
        label="Como pagou"
        wrap
        @update:model-value="emit('clear', 'method')"
      />
    </Field>

    <slot name="after-method" />

    <fieldset class="pf__set" :disabled="disabled">
      <legend class="label">Comprovante <span class="pf__opt">opcional</span></legend>
      <ReceiptDrop v-model="receipt" />
    </fieldset>
  </template>
</template>

<style scoped>
.pf__two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

@media (min-width: 520px) {
  .pf__two:has(> :nth-child(2)) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
  }
}

.pf__set {
  border: 0;
  padding: 0;
  min-width: 0;
}

.pf__set legend {
  padding: 0;
  margin-bottom: var(--s-3);
}

.pf__opt {
  margin-left: var(--s-1);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  color: var(--ink-3);
}
</style>
