<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  nowInZone,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  toYearMonth,
  updatePaymentSchema,
  type Payment,
  type PaymentMethod,
  type YearMonth,
} from "@emdia/shared";
import { computed, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import DateField from "@/components/ui/DateField.vue";
import Field from "@/components/ui/Field.vue";
import MonthField from "@/components/ui/MonthField.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Sheet from "@/components/ui/Sheet.vue";
import { countOf } from "@/lib/bulk.ts";
import { takesBulkMethod, type BulkPaymentChanges } from "@/lib/payments.ts";

const open = defineModel<boolean>("open", { required: true });
const { payments, busy = false } = defineProps<{
  payments: readonly Payment[];
  busy?: boolean;
}>();
const emit = defineEmits<{ submit: [changes: BulkPaymentChanges] }>();

const today = nowInZone(DEFAULT_TIMEZONE).date;

type Keep = "manter" | "mudar";
const KEEP_OPTIONS = [
  { value: "manter" as Keep, label: "Manter como está" },
  { value: "mudar" as Keep, label: "Mudar" },
];
/** Compensação is tied to what it abates, so it is never set in bulk. */
const METHOD_OPTIONS = [
  { value: "" as PaymentMethod | "", label: "Manter como está" },
  ...PAYMENT_METHODS.filter((m) => m !== "compensation").map((m) => ({
    value: m as PaymentMethod | "",
    label: PAYMENT_METHOD_LABEL[m],
  })),
];

const method = ref<PaymentMethod | "">("");
const paidOnMode = ref<Keep>("manter");
const paidOn = ref<string>(today);
const monthMode = ref<Keep>("manter");
const referenceMonth = ref<YearMonth>(toYearMonth(today));
const errors = ref<Record<string, string>>({});

/** What most of the selection shares, so "mudar" starts from a sensible value. */
function common<V>(values: readonly V[], fallback: V): V {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0]! : fallback;
}

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    method.value = "";
    paidOnMode.value = "manter";
    monthMode.value = "manter";
    paidOn.value = common(
      payments.map((p) => p.paidOn),
      today,
    );
    referenceMonth.value = common(
      payments.map((p) => p.referenceMonth),
      toYearMonth(today),
    );
    errors.value = {};
  },
  { immediate: true },
);

const noMethod = computed(() => payments.filter((p) => !takesBulkMethod(p)).length);
const confirmed = computed(() => payments.filter((p) => p.acknowledgedAt).length);

const changes = computed<BulkPaymentChanges>(() => ({
  ...(method.value ? { method: method.value } : {}),
  ...(paidOnMode.value === "mudar" ? { paidOn: paidOn.value } : {}),
  ...(monthMode.value === "mudar" ? { referenceMonth: referenceMonth.value } : {}),
}));

function onSubmit(): void {
  const result = updatePaymentSchema.safeParse(changes.value);
  if (!result.success) {
    const next: Record<string, string> = {};
    for (const issue of result.error.issues)
      next[String(issue.path[0] ?? "_form")] ??= issue.message;
    errors.value = next;
    return;
  }
  if (changes.value.paidOn && changes.value.paidOn > today) {
    errors.value = { paidOn: "A data não pode estar no futuro" };
    return;
  }
  errors.value = {};
  emit("submit", changes.value);
}
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Editar lançamentos"
    :subtitle="`${countOf(payments.length, 'lançamento')} selecionado${payments.length === 1 ? '' : 's'}`"
  >
    <form id="payment-bulk-form" class="stack" novalidate @submit.prevent="onSubmit">
      <p class="pb__lead">Só os campos que você mudar são alterados. O resto fica como está.</p>
      <p v-if="errors._form" class="form-error" role="alert">
        {{ errors._form === "Nada para alterar" ? "Mude pelo menos um campo." : errors._form }}
      </p>

      <Field
        v-slot="{ id, describedBy }"
        label="Como pagou"
        :error="errors.method"
        :hint="
          noMethod > 0
            ? `Não muda ${countOf(noMethod, 'lançamento')} que ${noMethod === 1 ? 'é desconto ou compensação' : 'são descontos ou compensações'}.`
            : undefined
        "
      >
        <ChoiceField
          :id="id"
          v-model="method"
          :options="METHOD_OPTIONS"
          label="Como pagou"
          wrap
          :described-by="describedBy"
        />
      </Field>

      <Field v-slot="{ id, invalid, describedBy }" label="Pago em" :error="errors.paidOn">
        <Segmented v-model="paidOnMode" :options="KEEP_OPTIONS" label="Pago em" />
        <DateField
          v-if="paidOnMode === 'mudar'"
          :id="id"
          v-model="paidOn"
          label="Pago em"
          :max="today"
          :invalid="invalid"
          :described-by="describedBy"
        />
      </Field>

      <Field
        v-slot="{ id, invalid, describedBy }"
        label="Mês de referência"
        :error="errors.referenceMonth"
      >
        <Segmented v-model="monthMode" :options="KEEP_OPTIONS" label="Mês de referência" />
        <MonthField
          v-if="monthMode === 'mudar'"
          :id="id"
          v-model="referenceMonth"
          label="Mês de referência"
          :invalid="invalid"
          :described-by="describedBy"
        />
      </Field>

      <p v-if="confirmed > 0" class="pb__warn" role="status">
        {{
          confirmed === 1
            ? "Um deles já tem “recebi”: se a data ou a forma mudar, ele volta para “aguardando”."
            : `${confirmed} já têm “recebi”: se a data ou a forma mudar, eles voltam para “aguardando”.`
        }}
      </p>
    </form>
    <template #footer>
      <Button :disabled="busy" @click="open = false">Cancelar</Button>
      <Button type="submit" form="payment-bulk-form" variant="primary" :loading="busy"
        >Salvar</Button
      >
    </template>
  </Sheet>
</template>

<style scoped>
.pb__lead {
  color: var(--ink-2);
}

.pb__warn {
  font-size: var(--t-14);
  color: var(--amber-ink);
}
</style>
