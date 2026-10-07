<script setup lang="ts">
import {
  createPaymentSchema,
  ENTRY_STATUS_LABEL,
  ENTRY_STATUSES,
  formatCents,
  formatDuration,
  monthName,
  parseYearMonth,
  shiftMinutes,
  upsertEntrySchema,
  weekdayOf,
  type Contract,
  type EntryStatus,
  type IsoDate,
  type Payment,
  type PaymentMethod,
  type WorkEntry,
} from "@emdia/shared";
import { computed, ref, watch } from "vue";
import { entriesApi, errorMessage, paymentsApi } from "@/api";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import TimeField from "@/components/ui/TimeField.vue";
import Sheet from "@/components/ui/Sheet.vue";
import Stepper from "@/components/ui/Stepper.vue";
import Toggle from "@/components/ui/Toggle.vue";
import { useForm } from "@/composables/form.ts";
import { formatDayMonth, formatRelative, WEEKDAY_LONG } from "@/lib/format.ts";
import { dayPaymentDraft, paymentFormData } from "@/lib/payments.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import { isWritable } from "@/lib/contract.ts";
import PaymentFields from "./PaymentFields.vue";

const open = defineModel<boolean>("open", { required: true });
const { date, entry, contract, today } = defineProps<{
  date: IsoDate | null;
  entry: WorkEntry | null;
  contract: Contract;
  today: IsoDate;
}>();
const emit = defineEmits<{
  saved: [entry: WorkEntry];
  removed: [date: IsoDate];
  paid: [payment: Payment];
}>();

const auth = useAuthStore();
const toast = useToastStore();

interface Values {
  status: EntryStatus;
  checkIn: string;
  checkOut: string;
  breakMinutes: number;
  note: string;
}

const { values, errors, formError, submitting, submit, clearError } = useForm(upsertEntrySchema, {
  status: "worked",
  checkIn: "",
  checkOut: "",
  breakMinutes: 0,
  note: "",
} as Values);

const isFuture = computed(() => !!date && date > today);
const statusOptions = computed(() =>
  ENTRY_STATUSES.filter(
    (s) => !isFuture.value || s === "day_off" || s === "holiday" || s === "excused",
  ).map((s) => ({
    value: s,
    label: ENTRY_STATUS_LABEL[s],
  })),
);

watch(
  () => [open.value, date, entry] as const,
  ([isOpen]) => {
    if (!isOpen || !date) return;
    const fallbackStatus: EntryStatus = isFuture.value ? "day_off" : "worked";
    values.status = entry?.status ?? fallbackStatus;
    values.checkIn = entry?.checkIn ?? (entry ? "" : (contract.expectedStart ?? ""));
    values.checkOut = entry?.checkOut ?? (entry ? "" : (contract.expectedEnd ?? ""));
    values.breakMinutes = entry?.breakMinutes ?? (entry ? 0 : 60);
    values.note = entry?.note ?? "";
    errors.value = {};
    formError.value = null;
  },
  { immediate: true },
);

const worked = computed(() => values.status === "worked");
const preview = computed(() =>
  worked.value && values.checkIn && values.checkOut
    ? formatDuration(shiftMinutes(values.checkIn, values.checkOut, values.breakMinutes))
    : null,
);
const overnight = computed(
  () => worked.value && values.checkIn && values.checkOut && values.checkOut < values.checkIn,
);

const mine = computed(() => !!entry && entry.createdBy === auth.user?.id);
const canConfirm = computed(
  () => !!entry && !!contract.workerId && !entry.confirmedAt && !mine.value,
);
const canDelete = computed(
  () => !!entry && (auth.isEmployer || (mine.value && !entry.confirmedAt)),
);
const ended = computed(() => !isWritable(contract));

const authorText = computed(() => {
  if (!entry) return null;
  const who = mine.value
    ? "você"
    : entry.createdByRole === "employer"
      ? contract.employerName
      : contract.workerName;
  return `anotado por ${who} · ${formatRelative(entry.updatedAt)}`;
});

const title = computed(() =>
  date ? `${WEEKDAY_LONG[weekdayOf(date)]}, ${formatDayMonth(date)}` : "",
);

/** The employer can pay a worked day in the same step; the payment counts in that day's month. */
const canPay = computed(() => auth.isEmployer && !ended.value && !isFuture.value);
const payNow = ref(false);
const {
  values: payValues,
  errors: payErrors,
  formError: payError,
  validate: validatePay,
  applyError: applyPayError,
  clearError: clearPayError,
} = useForm(createPaymentSchema, {
  referenceMonth: "",
  paidOn: today,
  amountCents: null as number | null,
  method: "pix" as PaymentMethod,
});
const receipt = ref<File | null>(null);
const paying = computed(() => payNow.value && worked.value && canPay.value);
const payHint = computed(() => {
  if (!date) return undefined;
  const month = monthName(parseYearMonth(date.slice(0, 7)).month);
  return contract.payType === "daily"
    ? `Vem com o valor da diária e entra na conta de ${month}.`
    : `Entra na conta de ${month}.`;
});

watch(
  () => [open.value, date] as const,
  ([isOpen]) => {
    if (!isOpen || !date) return;
    Object.assign(payValues, dayPaymentDraft(contract, date, today));
    receipt.value = null;
    payNow.value = false;
    payErrors.value = {};
    payError.value = null;
  },
  { immediate: true },
);

const payInput = () => ({ ...payValues, amountCents: payValues.amountCents ?? 0 });

async function payDay(): Promise<boolean> {
  const data = validatePay(payInput());
  if (!data) return false;
  try {
    const res = await paymentsApi.create(contract.id, paymentFormData(data, receipt.value));
    emit("paid", res.payment);
    return true;
  } catch (e) {
    applyPayError(e);
    return false;
  }
}

function focusFirstError(): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('#day-editor [aria-invalid="true"]')?.focus();
  });
}

const entryInput = computed(() => ({
  status: values.status,
  checkIn: worked.value ? values.checkIn || null : null,
  checkOut: worked.value ? values.checkOut || null : null,
  breakMinutes: worked.value ? values.breakMinutes : 0,
  note: values.note.trim() || null,
}));
/** Paying a day already recorded as is must not re-save it: that would undo its confirmation. */
const unchanged = computed(() => {
  const input = entryInput.value;
  return (
    !!entry &&
    entry.status === input.status &&
    entry.checkIn === input.checkIn &&
    entry.checkOut === input.checkOut &&
    entry.breakMinutes === input.breakMinutes &&
    entry.note === input.note
  );
});
const saveLabel = computed(() => {
  if (paying.value) return unchanged.value ? "Pagar" : entry ? "Salvar e pagar" : "Anotar e pagar";
  return entry ? "Salvar" : "Anotar";
});

function onSave(): void {
  if (!date) return;
  const input = entryInput.value;
  const withPayment = paying.value;
  // Check the payment before saving the day, so a typo doesn't leave the day saved and unpaid.
  if (withPayment && !validatePay(payInput())) {
    focusFirstError();
    return;
  }
  const skipEntry = withPayment && unchanged.value;
  void submit(async (data) => {
    if (!skipEntry) {
      const res = await entriesApi.upsert(contract.id, date, data);
      emit("saved", res.entry);
    }
    if (withPayment) {
      if (!(await payDay())) {
        toast.error(
          skipEntry
            ? "O pagamento não foi registrado. Confira e tente de novo."
            : "Dia anotado, mas o pagamento não foi registrado. Confira e tente de novo.",
        );
        focusFirstError();
        return;
      }
      const amount = formatCents(payValues.amountCents ?? 0);
      toast.success(
        skipEntry
          ? `Pagamento de ${amount} registrado.`
          : `Dia anotado e pagamento de ${amount} registrado.`,
      );
    } else {
      toast.success(
        entry?.confirmedAt ? "Dia atualizado. Precisa de nova confirmação." : "Dia anotado.",
      );
    }
    open.value = false;
  }, input);
}

const confirming = ref(false);
async function onConfirm(): Promise<void> {
  if (!date) return;
  confirming.value = true;
  try {
    const res = await entriesApi.confirm(contract.id, date);
    emit("saved", res.entry);
    toast.success("Dia confirmado.");
    open.value = false;
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    confirming.value = false;
  }
}

const removing = ref(false);
const confirmRemove = ref(false);
watch(open, () => (confirmRemove.value = false));
async function onRemove(): Promise<void> {
  if (!date) return;
  if (!confirmRemove.value) {
    confirmRemove.value = true;
    return;
  }
  removing.value = true;
  try {
    await entriesApi.remove(contract.id, date);
    emit("removed", date);
    toast.success("Registro apagado.");
    open.value = false;
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <Sheet
    v-model:open="open"
    :title="title"
    :subtitle="authorText ?? (isFuture ? 'Dia futuro' : 'Sem registro')"
  >
    <form id="day-editor" class="de" novalidate @submit.prevent="onSave">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <p v-if="ended" class="form-error">
        {{
          contract.archivedAt
            ? "Este vínculo foi removido. Só dá para consultar."
            : "Este vínculo foi encerrado. Só dá para consultar."
        }}
      </p>

      <div v-if="entry && contract.workerId" class="de__state">
        <span class="de__dot" :class="entry.confirmedAt ? 'is-ok' : 'is-open'" aria-hidden="true" />
        <span v-if="entry.confirmedAt">Confirmado {{ formatRelative(entry.confirmedAt) }}</span>
        <span v-else-if="mine">Aguardando a outra parte confirmar</span>
        <span v-else>Aguardando sua confirmação</span>
      </div>

      <fieldset class="de__set" :disabled="ended">
        <legend class="label">O que aconteceu</legend>
        <ChoiceField
          v-model="values.status"
          :options="statusOptions"
          label="O que aconteceu"
          wrap
        />
      </fieldset>

      <template v-if="worked">
        <div class="de__times">
          <Field v-slot="{ id, invalid, describedBy }" label="Entrada" :error="errors.checkIn">
            <TimeField
              :id="id"
              v-model="values.checkIn"
              label="Entrada"
              :step="15"
              :disabled="ended"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="clearError('checkIn')"
            />
          </Field>
          <Field v-slot="{ id, invalid, describedBy }" label="Saída" :error="errors.checkOut">
            <TimeField
              :id="id"
              v-model="values.checkOut"
              label="Saída"
              :step="15"
              :disabled="ended"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="clearError('checkOut')"
            />
          </Field>
        </div>
        <Field v-slot="{ id }" label="Pausa em minutos (almoço, descanso)">
          <Stepper :id="id" v-model="values.breakMinutes" label="Pausa" />
        </Field>
        <p v-if="preview" class="de__preview">
          Total do dia <strong class="mono">{{ preview }}</strong>
          <span v-if="overnight" class="de__night">· passou da meia-noite</span>
        </p>
      </template>

      <Field v-slot="{ id, invalid, describedBy }" label="Observação" optional :error="errors.note">
        <textarea
          :id="id"
          v-model="values.note"
          class="input"
          rows="2"
          maxlength="500"
          :disabled="ended"
          placeholder="Ex.: saiu mais cedo para levar o filho ao médico"
          :aria-invalid="invalid || undefined"
          :aria-describedby="describedBy"
        />
      </Field>

      <section v-if="worked && canPay" class="de__pay" aria-label="Pagamento do dia">
        <Toggle v-model="payNow" label="Pagar este dia agora" :hint="payHint" />
        <div v-if="payNow" class="de__payfields">
          <p v-if="payError" class="form-error" role="alert">{{ payError }}</p>
          <PaymentFields
            v-model:paid-on="payValues.paidOn"
            v-model:amount-cents="payValues.amountCents"
            v-model:method="payValues.method"
            v-model:receipt="receipt"
            :errors="payErrors"
            :today="today"
            @clear="clearPayError"
          />
        </div>
      </section>

      <div v-if="canDelete && !ended" class="de__danger">
        <Button variant="danger" icon="trash" :loading="removing" @click="onRemove">
          {{ confirmRemove ? "Toque de novo para apagar" : "Apagar registro" }}
        </Button>
      </div>
    </form>

    <template v-if="!ended" #footer>
      <Button v-if="canConfirm" icon="check" :loading="confirming" @click="onConfirm"
        >Confirmar</Button
      >
      <Button type="submit" form="day-editor" variant="primary" :loading="submitting">
        {{ saveLabel }}
      </Button>
    </template>
  </Sheet>
</template>

<style scoped>
.de {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.de__state {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-14);
  color: var(--ink-2);
}

.de__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.de__dot.is-ok {
  background: var(--brand);
}

.de__dot.is-open {
  border: 1.5px solid var(--ink-2);
}

.de__set {
  border: 0;
  padding: 0;
  min-width: 0;
}

.de__set legend {
  padding: 0;
  margin-bottom: var(--s-3);
}

.de__times {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}

.de__preview {
  font-size: var(--t-14);
  color: var(--ink-2);
  padding: var(--s-3) 0;
  border-top: 1px dashed var(--rule);
  border-bottom: 1px dashed var(--rule);
}

.de__preview strong {
  margin-left: var(--s-1);
  font-size: var(--t-20);
  color: var(--ink);
}

.de__night {
  color: var(--brand);
}

.de__pay {
  display: grid;
  gap: var(--s-5);
  padding-top: var(--s-4);
  border-top: 1px dashed var(--rule);
}

.de__payfields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.de__danger {
  padding-top: var(--s-2);
}
</style>
