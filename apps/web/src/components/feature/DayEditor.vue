<script setup lang="ts">
import {
  createPaymentSchema,
  ENTRY_STATUS_LABEL,
  ENTRY_STATUSES,
  formatCents,
  formatDuration,
  isOpenAdvance,
  expectedDayMinutes,
  isSalaried,
  monthName,
  parseYearMonth,
  addDays,
  MAX_STAY_DAYS,
  nightMinutes,
  stayMinutes,
  toYearMonth,
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
import { queryKeys } from "@/api/keys.ts";
import Button from "@/components/ui/Button.vue";
import DateField from "@/components/ui/DateField.vue";
import Field from "@/components/ui/Field.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import Select from "@/components/ui/Select.vue";
import { useResource } from "@/composables/resource.ts";
import TimeField from "@/components/ui/TimeField.vue";
import Sheet from "@/components/ui/Sheet.vue";
import Stepper from "@/components/ui/Stepper.vue";
import Toggle from "@/components/ui/Toggle.vue";
import { useForm } from "@/composables/form.ts";
import { formatDateShort, formatDayMonth, formatRelative, WEEKDAY_LONG } from "@/lib/format.ts";
import {
  advanceProgress,
  dayPaymentDraft,
  dayValueCents,
  paymentFormData,
} from "@/lib/payments.ts";
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
  /** The stay ends on a later date (a plantão); checkOutDate holds that date. */
  laterDay: boolean;
  checkOutDate: string;
  breakMinutes: number;
  note: string;
}

const { values, errors, formError, submitting, submit, clearError } = useForm(upsertEntrySchema, {
  status: "worked",
  checkIn: "",
  checkOut: "",
  laterDay: false,
  checkOutDate: "",
  breakMinutes: 0,
  note: "",
} as Values);

const shiftPay = contract.payType === "shift";
/** The latest check-out day a stay starting on `date` can have: a week later, never past today. */
const lastCheckOutDay = computed(() => {
  if (!date) return today;
  const week = addDays(date, MAX_STAY_DAYS);
  return week < today ? week : today;
});

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
    // A new plantão that started before today defaults to 24h: out the next day at the same time.
    const nextDay = addDays(date, 1);
    const fullShift = !entry && shiftPay && nextDay <= today;
    values.laterDay = entry ? entry.checkOutDate !== null : fullShift;
    values.checkOutDate = entry?.checkOutDate ?? (nextDay <= today ? nextDay : "");
    if (!entry && shiftPay && !fullShift) values.checkOut = "";
    values.breakMinutes = entry?.breakMinutes ?? (entry || shiftPay ? 0 : 60);
    values.note = entry?.note ?? "";
    errors.value = {};
    formError.value = null;
  },
  { immediate: true },
);

const worked = computed(() => values.status === "worked");
const checkOutDate = computed(() =>
  worked.value && values.laterDay && values.checkOutDate ? values.checkOutDate : null,
);
const stay = computed(() =>
  date && values.checkIn && values.checkOut
    ? {
        date,
        checkIn: values.checkIn,
        checkOut: values.checkOut,
        checkOutDate: checkOutDate.value,
        breakMinutes: values.breakMinutes,
      }
    : null,
);
const preview = computed(() =>
  worked.value && stay.value ? formatDuration(stayMinutes(stay.value)) : null,
);
const overnight = computed(
  () =>
    worked.value &&
    !checkOutDate.value &&
    values.checkIn &&
    values.checkOut &&
    values.checkOut < values.checkIn,
);
const night = computed(() =>
  worked.value && stay.value && contract.nightBonus ? nightMinutes(stay.value) : 0,
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

/** The employer can pay, abate and discount any worked day up to today. */
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
const monthLabel = computed(() =>
  date ? monthName(parseYearMonth(date.slice(0, 7)).month) : undefined,
);
const payHint = computed(() =>
  monthLabel.value ? `Entra na conta de ${monthLabel.value}.` : undefined,
);

const dayMinutes = computed(() => (stay.value ? stayMinutes(stay.value) : 0));
const dayValue = computed(() =>
  date
    ? dayValueCents(contract, {
        date,
        checkIn: values.checkIn || null,
        checkOut: values.checkOut || null,
        checkOutDate: checkOutDate.value,
        breakMinutes: values.breakMinutes,
        minutes: dayMinutes.value,
      })
    : null,
);
/** How the amount was reached, when it isn't simply the rate. */
const amountHint = computed(() => {
  const nightNote = night.value > 0 ? `, mais 20% em ${formatDuration(night.value)} de noite` : "";
  if (contract.payType === "shift" && dayMinutes.value > 0)
    return `${formatDuration(dayMinutes.value)} ÷ 24h × ${formatCents(contract.rateCents)}${nightNote}.`;
  if (contract.payType === "daily" && dayMinutes.value > 0) {
    const expected = expectedDayMinutes(contract, values.breakMinutes);
    if (expected && dayMinutes.value !== expected)
      return `${formatDuration(dayMinutes.value)} em vez de ${formatDuration(expected)}: diária de ${formatCents(contract.rateCents)} em proporção${nightNote}.`;
  }
  return nightNote
    ? `Inclui o adicional noturno: 20% em ${formatDuration(night.value)}.`
    : undefined;
});

/** The amount follows the hours, less what is abated and discounted, until the employer types one. */
const amountTyped = ref(false);
watch(
  () => [open.value, date] as const,
  ([isOpen]) => {
    if (!isOpen || !date) return;
    Object.assign(payValues, dayPaymentDraft(contract, date, today, dayValue.value));
    amountTyped.value = false;
    receipt.value = null;
    payNow.value = false;
    payErrors.value = {};
    payError.value = null;
  },
  { immediate: true },
);

/**
 * Besides paying, the employer can abate the day from an open adiantamento (a compensation
 * payment linked to it, so the day counts as paid and the advance shrinks) and discount an
 * amount from it (a desconto, which only lowers what is due in the day's month).
 */
const advances = useResource(
  () => (open.value && canPay.value ? contract.id : ""),
  (id) => (id ? queryKeys.advances(id) : null),
  (id) => paymentsApi.advances(id).then((r) => r.advances),
);
/**
 * A day already abated shows as such when the editor opens again: its compensation payment is
 * dated the worked day and linked to an adiantamento.
 */
const dayPayments = useResource(
  () =>
    open.value && canPay.value && date ? { id: contract.id, year: Number(date.slice(0, 4)) } : null,
  (s) => (s ? queryKeys.payments(s) : null),
  (s) => (s ? paymentsApi.list(s.id, s.year).then((r) => r.payments) : Promise.resolve([])),
);
const abated = computed(
  () =>
    dayPayments.data.value?.find(
      (p) =>
        p.kind === "pay" &&
        p.method === "compensation" &&
        p.advanceId !== null &&
        p.paidOn === date,
    ) ?? null,
);
const abatedHint = computed(() => {
  const p = abated.value;
  if (!p) return undefined;
  const from = advances.data.value?.find((a) => a.id === p.advanceId);
  return `${formatCents(p.amountCents)} abatidos${from ? ` do adiantamento de ${formatDateShort(from.paidOn)}` : ""}.\nPara desfazer, apague o abatimento em Pagamentos.`;
});

/** Oldest first: an advance is paid down in the order it was handed. */
const openAdvances = computed(() =>
  [...(advances.data.value ?? [])].filter(isOpenAdvance).reverse(),
);
const abateNow = ref(false);
const advanceId = ref("");
const abateCents = ref<number | null>(null);
const abateError = ref<string | null>(null);
const advance = computed(
  () => openAdvances.value.find((a) => a.id === advanceId.value) ?? openAdvances.value[0] ?? null,
);
const advanceOptions = computed(() =>
  openAdvances.value.map((a) => ({
    value: a.id,
    label: `Adiantamento de ${formatDateShort(a.paidOn)}`,
    description: advanceProgress(a).toLowerCase(),
  })),
);
const abating = computed(() => abateNow.value && worked.value && canPay.value && !!advance.value);
const abateHint = computed(() => {
  const a = advance.value;
  if (!a) return undefined;
  const left = advanceProgress(a);
  const remaining = a.remainingCents ?? 0;
  return dayValue.value !== null && dayValue.value > remaining
    ? `${left}.\nO dia vale ${formatCents(dayValue.value)}: o resto fica a pagar.`
    : `${left}.`;
});

const deductNow = ref(false);
const deductCents = ref<number | null>(null);
const deductNote = ref("");
const deductError = ref<string | null>(null);
const deducting = computed(() => deductNow.value && worked.value && canPay.value);
const defaultDeductNote = computed(() =>
  date ? `Desconto do dia ${formatDateShort(date).slice(0, 5)}` : "",
);

/** What is left to hand over once the abatement and the desconto are taken off the day. */
const suggestedPay = computed(() => {
  if (isSalaried(contract.payType) || dayValue.value === null) return dayValue.value;
  const taken =
    (abating.value ? (abateCents.value ?? 0) : 0) +
    (deducting.value ? (deductCents.value ?? 0) : 0);
  return Math.max(0, dayValue.value - taken);
});
watch(suggestedPay, (cents) => {
  if (!amountTyped.value && !isSalaried(contract.payType)) payValues.amountCents = cents;
});

watch(abateNow, (on) => {
  if (!on) return;
  abateError.value = null;
  const a = advance.value;
  if (a)
    abateCents.value = Math.min(dayValue.value ?? a.remainingCents ?? 0, a.remainingCents ?? 0);
});
watch(deductNow, (on) => {
  if (!on) return;
  deductError.value = null;
  if (!deductNote.value) deductNote.value = defaultDeductNote.value;
});
watch(advanceId, () => {
  const a = advance.value;
  if (a && abateCents.value !== null && abateCents.value > (a.remainingCents ?? 0))
    abateCents.value = a.remainingCents;
});
watch(
  () => [open.value, date] as const,
  ([isOpen]) => {
    if (!isOpen) return;
    abateNow.value = false;
    advanceId.value = "";
    abateCents.value = null;
    abateError.value = null;
    deductNow.value = false;
    deductCents.value = null;
    deductNote.value = "";
    deductError.value = null;
  },
);

/** With the day covered by abatements and descontos, there is nothing left to hand over. */
const handsNothing = computed(
  () => paying.value && (abating.value || deducting.value) && (payValues.amountCents ?? 0) <= 0,
);
const payPlanned = computed(() => paying.value && !handsNothing.value);
const planned = computed(() => [payPlanned.value, abating.value, deducting.value].filter(Boolean));

const splitText = computed(() => {
  const parts: string[] = [];
  if (abating.value) parts.push(`abate ${formatCents(abateCents.value ?? 0)}`);
  if (deducting.value) parts.push(`desconta ${formatCents(deductCents.value ?? 0)}`);
  if (payPlanned.value && (payValues.amountCents ?? 0) > 0)
    parts.push(`paga ${formatCents(payValues.amountCents ?? 0)}`);
  else if (handsNothing.value) parts.push("não paga em dinheiro");
  if (parts.length === 0) return null;
  return `${parts.join(", ").replace(/^./, (c) => c.toUpperCase())}.`;
});

function abateInput() {
  const remaining = advance.value?.remainingCents ?? 0;
  const amount = abateCents.value ?? 0;
  if (amount <= 0) abateError.value = "Informe o valor";
  else if (amount > remaining)
    abateError.value = `O adiantamento só tem ${formatCents(remaining)} para abater`;
  else abateError.value = null;
  return abateError.value || !date || !advance.value
    ? null
    : {
        kind: "pay" as const,
        referenceMonth: toYearMonth(date),
        paidOn: date,
        amountCents: amount,
        method: "compensation" as const,
        advanceId: advance.value.id,
        note: `Dia ${formatDateShort(date).slice(0, 5)} abatido do adiantamento`,
      };
}

function deductInput() {
  const amount = deductCents.value ?? 0;
  deductError.value = amount <= 0 ? "Informe o valor" : null;
  return deductError.value || !date
    ? null
    : {
        kind: "deduction" as const,
        referenceMonth: toYearMonth(date),
        paidOn: date,
        amountCents: amount,
        method: null,
        note: deductNote.value.trim() || defaultDeductNote.value,
      };
}

const payInput = () => ({ ...payValues, amountCents: payValues.amountCents ?? 0 });

/** Money paid on a day goes from the worked day up to today, never before it. */
function validatePayment() {
  if (date && payValues.paidOn && payValues.paidOn < date) {
    payErrors.value = { paidOn: "O pagamento não pode ser antes do dia trabalhado" };
    return null;
  }
  return validatePay(payInput());
}

type Step = "abate" | "deduct" | "pay";

/** Checks every planned payment first, so a typo doesn't leave the day saved and unpaid. */
function validateSteps(): boolean {
  const checks = [
    abating.value ? abateInput() : true,
    deducting.value ? deductInput() : true,
    payPlanned.value ? validatePayment() : true,
  ];
  return checks.every(Boolean);
}

async function send(step: Step): Promise<boolean> {
  try {
    const data =
      step === "pay" ? validatePayment() : step === "abate" ? abateInput() : deductInput();
    if (!data) return false;
    const form = paymentFormData(data, step === "pay" ? receipt.value : null);
    const res = await paymentsApi.create(contract.id, form);
    emit("paid", res.payment);
    return true;
  } catch (e) {
    if (step === "abate") abateError.value = errorMessage(e);
    else if (step === "deduct") deductError.value = errorMessage(e);
    else applyPayError(e);
    return false;
  }
}

/** A step that went through is switched off, so trying again after a failure doesn't repeat it. */
function settle(step: Step): void {
  amountTyped.value = true;
  if (step === "abate") abateNow.value = false;
  else if (step === "deduct") deductNow.value = false;
  else payNow.value = false;
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
  checkOutDate: checkOutDate.value,
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
    entry.checkOutDate === input.checkOutDate &&
    entry.breakMinutes === input.breakMinutes &&
    entry.note === input.note
  );
});
const saveLabel = computed(() => {
  const only = planned.value.length === 1;
  const verb = !only
    ? "lançar"
    : payPlanned.value
      ? "pagar"
      : abating.value
        ? "abater"
        : "descontar";
  if (planned.value.length === 0) return entry ? "Salvar" : "Anotar";
  if (unchanged.value) return verb[0]!.toUpperCase() + verb.slice(1);
  return `${entry ? "Salvar" : "Anotar"} e ${verb}`;
});

const DONE: Record<Step, (cents: number) => string> = {
  abate: (c) => `${formatCents(c)} abatidos do adiantamento`,
  deduct: (c) => `desconto de ${formatCents(c)} lançado`,
  pay: (c) => `pagamento de ${formatCents(c)} registrado`,
};
const FAILED: Record<Step, string> = {
  abate: "o abatimento",
  deduct: "o desconto",
  pay: "o pagamento",
};
const upper = (text: string) => text[0]!.toUpperCase() + text.slice(1);
const joinDone = (done: string[]) =>
  done.length < 2 ? (done[0] ?? "") : `${done.slice(0, -1).join(", ")} e ${done.at(-1)}`;

function onSave(): void {
  if (!date) return;
  const input = entryInput.value;
  const steps: Step[] = [
    ...(abating.value ? (["abate"] as const) : []),
    ...(deducting.value ? (["deduct"] as const) : []),
    ...(payPlanned.value ? (["pay"] as const) : []),
  ];
  if (!validateSteps()) {
    focusFirstError();
    return;
  }
  const skipEntry = steps.length > 0 && unchanged.value;
  const cents: Record<Step, number> = {
    abate: abateCents.value ?? 0,
    deduct: deductCents.value ?? 0,
    pay: payValues.amountCents ?? 0,
  };
  void submit(async (data) => {
    if (!skipEntry) {
      const res = await entriesApi.upsert(contract.id, date, data);
      emit("saved", res.entry);
    }
    const done: string[] = skipEntry ? [] : ["dia anotado"];
    for (const step of steps) {
      if (!(await send(step))) {
        const saved = done.length > 0 ? `${upper(joinDone(done))}, mas` : "";
        toast.error(
          saved
            ? `${saved} ${FAILED[step]} não foi registrado. Confira e tente de novo.`
            : `${upper(FAILED[step])} não foi registrado. Confira e tente de novo.`,
        );
        focusFirstError();
        return;
      }
      settle(step);
      done.push(DONE[step](cents[step]));
    }
    if (steps.length > 0) {
      toast.success(`${upper(joinDone(done))}.`);
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
              until-midnight
              :step="15"
              :disabled="ended"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="clearError('checkOut')"
            />
          </Field>
        </div>
        <Toggle
          v-model="values.laterDay"
          :disabled="ended || !values.checkOutDate"
          label="Saiu em outro dia"
          :hint="
            values.checkOutDate
              ? 'Plantão ou dias seguidos: um registro só, da entrada até a saída.'
              : 'Só depois de amanhecer o dia seguinte.'
          "
        />
        <Field
          v-if="values.laterDay"
          v-slot="{ id, invalid, describedBy }"
          label="Dia da saída"
          :error="errors.checkOutDate"
        >
          <DateField
            :id="id"
            v-model="values.checkOutDate"
            label="Dia da saída"
            :min="date ? addDays(date, 1) : undefined"
            :max="lastCheckOutDay"
            :disabled="ended"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="clearError('checkOutDate')"
          />
        </Field>
        <Field v-slot="{ id }" label="Pausa em minutos (almoço, descanso)">
          <Stepper :id="id" v-model="values.breakMinutes" label="Pausa" />
        </Field>
        <p v-if="preview" class="de__preview">
          {{ checkOutDate ? "Total" : "Total do dia" }} <strong class="mono">{{ preview }}</strong>
          <span v-if="overnight" class="de__night">{{
            values.checkOut === "00:00" ? "· até meia-noite" : "· passou da meia-noite"
          }}</span>
          <span v-if="night > 0" class="de__night"
            >· {{ formatDuration(night) }} entre 22h e 5h</span
          >
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
        <Toggle v-model="payNow" label="Pagar este dia" :hint="payHint" />
        <div v-if="payNow" class="de__payfields">
          <p v-if="payError" class="form-error" role="alert">{{ payError }}</p>
          <PaymentFields
            v-model:paid-on="payValues.paidOn"
            v-model:amount-cents="payValues.amountCents"
            v-model:method="payValues.method"
            v-model:receipt="receipt"
            :errors="payErrors"
            :today="today"
            :min-date="date ?? undefined"
            :amount-hint="amountHint"
            @clear="clearPayError"
            @amount-input="amountTyped = true"
          />
        </div>

        <Toggle
          v-if="abated"
          :model-value="true"
          disabled
          label="Abatido do adiantamento"
          :hint="abatedHint"
        />
        <template v-else-if="openAdvances.length > 0">
          <Toggle v-model="abateNow" label="Abater do adiantamento" :hint="abateHint" />
          <div v-if="abateNow" class="de__payfields">
            <Field
              v-if="openAdvances.length > 1"
              v-slot="{ id, describedBy }"
              label="Qual adiantamento"
            >
              <Select
                :id="id"
                :model-value="advance?.id ?? ''"
                :options="advanceOptions"
                label="Qual adiantamento"
                :described-by="describedBy"
                @update:model-value="(v) => (advanceId = v ?? '')"
              />
            </Field>
            <Field
              v-slot="{ id, invalid, describedBy }"
              label="Valor abatido"
              :error="abateError"
              hint="O dia conta como pago e sai do que resta do adiantamento."
            >
              <MoneyInput
                :id="id"
                v-model="abateCents"
                :invalid="invalid"
                :described-by="describedBy"
                @update:model-value="abateError = null"
              />
            </Field>
          </div>
        </template>

        <Toggle
          v-model="deductNow"
          label="Descontar um valor do dia"
          :hint="`Diminui o que você deve da conta de ${monthLabel}. Não é dinheiro entregue.`"
        />
        <div v-if="deductNow" class="de__payfields">
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="Valor do desconto"
            :error="deductError"
          >
            <MoneyInput
              :id="id"
              v-model="deductCents"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="deductError = null"
            />
          </Field>
          <Field v-slot="{ id, describedBy }" label="Descrição">
            <input
              :id="id"
              v-model="deductNote"
              class="input"
              type="text"
              maxlength="500"
              :aria-describedby="describedBy"
            />
          </Field>
        </div>

        <p v-if="splitText" class="de__split">{{ splitText }}</p>
      </section>
    </form>

    <template v-if="!ended" #footer>
      <div class="de__foot">
        <Button
          v-if="canDelete"
          variant="danger"
          icon="trash"
          :loading="removing"
          @click="onRemove"
        >
          {{ confirmRemove ? "Toque de novo para apagar" : "Apagar registro" }}
        </Button>
        <Button v-if="canConfirm" icon="check" :loading="confirming" @click="onConfirm"
          >Confirmar</Button
        >
        <Button type="submit" form="day-editor" variant="primary" :loading="submitting">
          {{ saveLabel }}
        </Button>
      </div>
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
  margin-left: var(--s-1);
  color: var(--brand);
}

.de__pay {
  display: grid;
  gap: var(--s-5);
  padding-top: var(--s-4);
  border-top: 1px dashed var(--rule);
}

.de__split {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.de__payfields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

/* Small screens stack the actions with Salvar on top; wider ones line them up, Salvar last. */
.de__foot {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--s-3);
}

.de__foot > * {
  flex: 1;
}

@media (min-width: 520px) {
  .de__foot {
    flex-direction: row;
  }
}
</style>
