<script setup lang="ts">
import {
  createContractSchema,
  DEFAULT_TIMEZONE,
  nowInZone,
  OCCUPATION_LABEL,
  OCCUPATIONS,
  isSalaried,
  PAY_TYPE_LABEL,
  PAY_TYPES,
  type CreateContractInput,
  type Occupation,
  type PayType,
  type Schedule,
  toYearMonth,
} from "@emdia/shared";
import { computed, useId } from "vue";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import DateField from "@/components/ui/DateField.vue";
import Select from "@/components/ui/Select.vue";
import TimeField from "@/components/ui/TimeField.vue";
import { useForm } from "@/composables/form.ts";
import Toggle from "@/components/ui/Toggle.vue";
import { maskPhone } from "@/lib/phone.ts";
import { DEFAULT_SCHEDULE } from "@/lib/schedule.ts";
import EstimatePanel from "./EstimatePanel.vue";
import ScheduleField from "./ScheduleField.vue";

interface FormValues {
  workerName: string;
  occupation: Occupation;
  payType: PayType;
  rateCents: number | null;
  schedule: Schedule;
  deductAbsences: boolean;
  nightBonus: boolean;
  expectedStart: string;
  expectedEnd: string;
  startedOn: string;
  contactEmail: string;
  contactPhone: string;
}

const {
  initial,
  submitLabel,
  save,
  lockStart = false,
  contact = false,
  summary = false,
  summaryTerms = true,
} = defineProps<{
  initial?: Partial<CreateContractInput>;
  submitLabel: string;
  save: (data: CreateContractInput) => Promise<void>;
  /** Editing the start date of a contract with history would orphan entries; the API decides, we just hint. */
  lockStart?: boolean;
  /** Show the optional e-mail/phone section and send it (left out otherwise, so an edit never clears it). */
  contact?: boolean;
  /** Live "resumo" panel with the estimated cost: beside the form on lg, under it below. */
  summary?: boolean;
  /** Frequency and hours in the resumo; off where the form beside it already shows them. */
  summaryTerms?: boolean;
}>();

const defaults: FormValues = {
  workerName: initial?.workerName ?? "",
  occupation: initial?.occupation ?? "diarista",
  payType: initial?.payType ?? "daily",
  rateCents: initial?.rateCents ?? null,
  schedule: initial?.schedule ?? DEFAULT_SCHEDULE,
  deductAbsences: initial?.deductAbsences ?? false,
  nightBonus: initial?.nightBonus ?? true,
  expectedStart: initial?.expectedStart ?? "08:00",
  expectedEnd: initial?.expectedEnd ?? "17:00",
  startedOn: initial?.startedOn ?? nowInZone(DEFAULT_TIMEZONE).date,
  contactEmail: initial?.contactEmail ?? "",
  contactPhone: initial?.contactPhone ?? "",
};

const { values, errors, formError, submitting, submit, clearError } = useForm(
  createContractSchema,
  defaults,
);

const formId = useId();
const occupationOptions = OCCUPATIONS.map((o) => ({ value: o, label: OCCUPATION_LABEL[o] }));
const payOptions = PAY_TYPES.map((p) => ({ value: p, label: PAY_TYPE_LABEL[p] }));

const RATE_LABEL: Record<PayType, string> = {
  hourly: "Valor da hora",
  daily: "Valor da diária",
  shift: "Valor do plantão (24h)",
  biweekly: "Valor da quinzena",
  monthly: "Salário mensal",
};

const today = nowInZone(DEFAULT_TIMEZONE).date;
/** Preview the month the contract is in now, or its first month if it starts later. */
const previewMonth = computed(() =>
  toYearMonth(values.startedOn && values.startedOn > today ? values.startedOn : today),
);

const draft = computed(() => ({
  ...values,
  expectedStart: values.expectedStart || null,
  expectedEnd: values.expectedEnd || null,
  contactEmail: contact ? values.contactEmail : undefined,
  contactPhone: contact ? values.contactPhone : undefined,
}));

function onPhone(e: Event): void {
  const el = e.target as HTMLInputElement;
  const masked = maskPhone(el.value);
  // Keep the DOM in step even when the model doesn't change (a letter typed and dropped).
  el.value = masked;
  values.contactPhone = masked;
  clearError("contactPhone");
}

function onSubmit(): void {
  const { contactEmail, contactPhone, ...rest } = values;
  const input = {
    ...rest,
    ...(contact ? { contactEmail: contactEmail.trim(), contactPhone } : {}),
    deductAbsences: isSalaried(values.payType) && values.deductAbsences,
    rateCents: values.rateCents ?? 0,
    expectedStart: values.expectedStart || null,
    expectedEnd: values.expectedEnd || null,
  };
  void submit(save, input);
}
</script>

<template>
  <div class="cf-wrap" :class="{ 'has-summary': summary }">
    <form :id="formId" class="cf" novalidate @submit.prevent="onSubmit">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

      <section class="cf__sec" :aria-labelledby="`${formId}-who`">
        <h2 :id="`${formId}-who`" class="cf__title">Quem é</h2>
        <div class="cf__two cf__two--wide">
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="Nome de quem trabalha"
            :error="errors.workerName"
          >
            <input
              :id="id"
              v-model="values.workerName"
              class="input"
              type="text"
              autocomplete="off"
              placeholder="Maria da Silva"
              :aria-invalid="invalid || undefined"
              :aria-describedby="describedBy"
              @input="clearError('workerName')"
            />
          </Field>
          <Field v-slot="{ id, invalid, describedBy }" label="Função" :error="errors.occupation">
            <Select
              :id="id"
              :model-value="values.occupation"
              :options="occupationOptions"
              label="Função"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="(v) => v && (values.occupation = v)"
            />
          </Field>
        </div>
      </section>

      <section v-if="contact" class="cf__sec" :aria-labelledby="`${formId}-contact`">
        <div class="cf__head">
          <h2 :id="`${formId}-contact`" class="cf__title">
            Contato <span class="cf__opt">opcional</span>
          </h2>
          <p class="cf__desc">Se você preencher, a gente manda o link de cadastro.</p>
        </div>
        <div class="cf__two cf__two--wide">
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="E-mail"
            optional
            :error="errors.contactEmail"
          >
            <input
              :id="id"
              v-model="values.contactEmail"
              class="input"
              type="email"
              inputmode="email"
              autocomplete="off"
              placeholder="maria@email.com"
              :aria-invalid="invalid || undefined"
              :aria-describedby="describedBy"
              @input="clearError('contactEmail')"
            />
          </Field>
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="Telefone (WhatsApp)"
            optional
            :error="errors.contactPhone"
          >
            <input
              :id="id"
              :value="values.contactPhone"
              class="input input--mono"
              type="tel"
              inputmode="numeric"
              autocomplete="off"
              placeholder="(11) 91234-5678"
              :aria-invalid="invalid || undefined"
              :aria-describedby="describedBy"
              @input="onPhone"
            />
          </Field>
        </div>
      </section>

      <section class="cf__sec" :aria-labelledby="`${formId}-pay`">
        <h2 :id="`${formId}-pay`" class="cf__title">Pagamento</h2>
        <div class="cf__pay">
          <Field v-slot="{ id }" label="Como paga">
            <ChoiceField
              :id="id"
              v-model="values.payType"
              :options="payOptions"
              label="Como paga"
            />
          </Field>
          <Field
            v-slot="{ id, invalid, describedBy }"
            :label="RATE_LABEL[values.payType]"
            :error="errors.rateCents"
          >
            <MoneyInput
              :id="id"
              v-model="values.rateCents"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="clearError('rateCents')"
            />
          </Field>
        </div>
        <Toggle
          v-if="isSalaried(values.payType)"
          v-model="values.deductAbsences"
          label="Descontar faltas sem justificativa"
          hint="Cada falta sem justificativa desconta 1/30 do salário do mês."
        />
        <Toggle
          v-model="values.nightBonus"
          label="Adicional noturno"
          hint="As horas entre 22h e 5h valem 20% a mais. Desligue se combinaram outra coisa com a pessoa."
        />
        <p v-if="values.payType === 'shift'" class="cf__desc">
          Cada 24h valem um plantão. Quem entra sexta às 8h e sai segunda às 8h fez 3 plantões; no
          cartão, anote a entrada no primeiro dia e a saída no dia em que foi embora.
        </p>
      </section>

      <section class="cf__sec" :aria-labelledby="`${formId}-freq`">
        <h2 :id="`${formId}-freq`" class="cf__title">Frequência</h2>
        <ScheduleField
          v-model="values.schedule"
          :month="previewMonth"
          :started-on="values.startedOn"
          :error="errors.schedule"
          legend-hidden
          @update:model-value="clearError('schedule')"
        />
      </section>

      <section class="cf__sec" :aria-labelledby="`${formId}-hours`">
        <div class="cf__head">
          <h2 :id="`${formId}-hours`" class="cf__title">
            Horários <span class="cf__opt">opcional</span>
          </h2>
          <p v-if="values.payType === 'hourly'" class="cf__desc">
            Por hora, os horários entram na conta do custo estimado.
          </p>
        </div>
        <div class="cf__two">
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="Chega às"
            optional
            :error="errors.expectedStart"
          >
            <TimeField
              :id="id"
              v-model="values.expectedStart"
              label="Chega às"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="clearError('expectedStart')"
            />
          </Field>
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="Sai às"
            optional
            :error="errors.expectedEnd"
          >
            <TimeField
              :id="id"
              v-model="values.expectedEnd"
              label="Sai às"
              until-midnight
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="clearError('expectedEnd')"
            />
          </Field>
        </div>
      </section>

      <section class="cf__sec" :aria-labelledby="`${formId}-start`">
        <h2 :id="`${formId}-start`" class="cf__title">Início</h2>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Começou em"
          :error="errors.startedOn"
          :hint="lockStart ? 'Mudar a data de início não apaga registros antigos.' : undefined"
        >
          <DateField
            :id="id"
            v-model="values.startedOn"
            class="cf__date"
            label="Começou em"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="clearError('startedOn')"
          />
        </Field>
      </section>
    </form>

    <EstimatePanel
      v-if="summary"
      class="cf-wrap__panel"
      :draft="draft"
      :terms="summaryTerms"
      :month="previewMonth"
      :today="today"
    />

    <div class="cf-wrap__submit">
      <Button type="submit" :form="formId" variant="primary" :loading="submitting">{{
        submitLabel
      }}</Button>
    </div>
  </div>
</template>

<style scoped>
.cf-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "form" "panel" "submit";
  gap: var(--s-6);
}

.cf {
  grid-area: form;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
  min-width: 0;
}

.cf-wrap__panel {
  grid-area: panel;
}

.cf-wrap__submit {
  grid-area: submit;
}

.cf-wrap__submit > :deep(.btn) {
  min-width: 220px;
}

.cf-wrap:not(.has-summary) {
  grid-template-areas: "form" "submit";
}

.has-summary .cf__sec {
  padding: var(--s-6);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
}

.cf__sec {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
  min-width: 0;
}

.cf__head {
  display: grid;
  gap: var(--s-1);
}

.cf__title {
  font-size: var(--t-20);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.cf__opt {
  margin-left: var(--s-1);
  font-size: var(--t-14);
  font-weight: 400;
  letter-spacing: 0;
  color: var(--ink-3);
}

.cf__desc {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.cf__pay {
  display: grid;
  gap: var(--s-5);
}

.cf__two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}

.cf__two--wide {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.cf__date {
  max-width: 240px;
}

@media (min-width: 600px) {
  .cf__two--wide {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
  }
}

@media (min-width: 960px) {
  .cf-wrap.has-summary {
    grid-template-columns: minmax(0, var(--form)) minmax(300px, 400px);
    grid-template-areas: "form panel" "submit panel";
    grid-template-rows: auto 1fr;
    column-gap: var(--s-8);
    align-items: start;
  }
  .has-summary .cf-wrap__panel {
    position: sticky;
    top: var(--s-6);
  }
}

/* Phones: the schedule's 7 weekday buttons need the full width, so sections drop the card. */
@media (max-width: 639px) {
  .has-summary .cf__sec {
    padding: var(--s-5) 0 0;
    background: none;
    border: 0;
    border-top: 1px solid var(--rule);
    border-radius: 0;
  }
  .has-summary .cf__sec:first-of-type {
    padding-top: 0;
    border-top: 0;
  }
}
</style>
