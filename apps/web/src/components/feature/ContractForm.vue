<script setup lang="ts">
import {
  createContractSchema,
  DEFAULT_TIMEZONE,
  nowInZone,
  OCCUPATION_LABEL,
  OCCUPATIONS,
  PAY_TYPE_LABEL,
  PAY_TYPES,
  type CreateContractInput,
  type Occupation,
  type PayType,
} from "@ponto/shared";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import Segmented from "@/components/ui/Segmented.vue";
import { useForm } from "@/composables/form.ts";
import WeekdayToggles from "./WeekdayToggles.vue";

interface FormValues {
  workerName: string;
  occupation: Occupation;
  payType: PayType;
  rateCents: number | null;
  scheduleDays: number[];
  expectedStart: string;
  expectedEnd: string;
  startedOn: string;
}

const {
  initial,
  submitLabel,
  save,
  lockStart = false,
} = defineProps<{
  initial?: Partial<CreateContractInput>;
  submitLabel: string;
  save: (data: CreateContractInput) => Promise<void>;
  /** Editing the start date of a contract with history would orphan entries; the API decides, we just hint. */
  lockStart?: boolean;
}>();

const defaults: FormValues = {
  workerName: initial?.workerName ?? "",
  occupation: initial?.occupation ?? "diarista",
  payType: initial?.payType ?? "daily",
  rateCents: initial?.rateCents ?? null,
  scheduleDays: initial?.scheduleDays ? [...initial.scheduleDays] : [1, 3, 5],
  expectedStart: initial?.expectedStart ?? "08:00",
  expectedEnd: initial?.expectedEnd ?? "17:00",
  startedOn: initial?.startedOn ?? nowInZone(DEFAULT_TIMEZONE).date,
};

const { values, errors, formError, submitting, submit, clearError } = useForm(
  createContractSchema,
  defaults,
);

const occupationOptions = OCCUPATIONS.map((o) => ({ value: o, label: OCCUPATION_LABEL[o] }));
const payOptions = PAY_TYPES.map((p) => ({ value: p, label: PAY_TYPE_LABEL[p] }));

const RATE_LABEL: Record<PayType, string> = {
  hourly: "Valor da hora",
  daily: "Valor da diária",
  monthly: "Salário mensal",
};

function onSubmit(): void {
  const input = {
    ...values,
    rateCents: values.rateCents ?? 0,
    expectedStart: values.expectedStart || null,
    expectedEnd: values.expectedEnd || null,
  };
  void submit(save, input);
}
</script>

<template>
  <form class="cf" novalidate @submit.prevent="onSubmit">
    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

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

    <fieldset class="cf__set">
      <legend class="label">Função</legend>
      <Segmented v-model="values.occupation" :options="occupationOptions" label="Função" wrap />
    </fieldset>

    <div class="cf__pay">
      <fieldset class="cf__set">
        <legend class="label">Como paga</legend>
        <Segmented v-model="values.payType" :options="payOptions" label="Como paga" />
      </fieldset>
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

    <fieldset class="cf__set">
      <legend class="label">Dias que vem</legend>
      <WeekdayToggles v-model="values.scheduleDays" label="Dias que vem" />
      <p class="cf__hint">
        Usamos para lembrar dos dias sem registro. Pode ficar vazio se não tiver dia fixo.
      </p>
    </fieldset>

    <div class="cf__two">
      <Field
        v-slot="{ id, invalid, describedBy }"
        label="Chega às"
        optional
        :error="errors.expectedStart"
      >
        <input
          :id="id"
          v-model="values.expectedStart"
          class="input"
          type="time"
          :aria-invalid="invalid || undefined"
          :aria-describedby="describedBy"
          @input="clearError('expectedStart')"
        />
      </Field>
      <Field
        v-slot="{ id, invalid, describedBy }"
        label="Sai às"
        optional
        :error="errors.expectedEnd"
      >
        <input
          :id="id"
          v-model="values.expectedEnd"
          class="input"
          type="time"
          :aria-invalid="invalid || undefined"
          :aria-describedby="describedBy"
          @input="clearError('expectedEnd')"
        />
      </Field>
    </div>

    <Field
      v-slot="{ id, invalid, describedBy }"
      label="Começou em"
      :error="errors.startedOn"
      :hint="lockStart ? 'Mudar a data de início não apaga registros antigos.' : undefined"
    >
      <input
        :id="id"
        v-model="values.startedOn"
        class="input cf__date"
        type="date"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedBy"
        @input="clearError('startedOn')"
      />
    </Field>

    <Button type="submit" variant="primary" :loading="submitting">{{ submitLabel }}</Button>
  </form>
</template>

<style scoped>
.cf {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.cf__set {
  border: 0;
  padding: 0;
  display: grid;
  gap: var(--s-2);
  min-width: 0;
}

.cf__set legend {
  padding: 0;
  margin-bottom: var(--s-2);
}

.cf__hint {
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

.cf__date {
  max-width: 240px;
}

.cf > :deep(.btn) {
  justify-self: start;
  min-width: 200px;
}

@media (min-width: 600px) {
  .cf__pay {
    grid-template-columns: 1.3fr 1fr;
    align-items: start;
  }
}
</style>
