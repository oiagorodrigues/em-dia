<script setup lang="ts">
import {
  SCHEDULE_KIND_LABEL,
  SCHEDULE_KINDS,
  type Schedule,
  type ScheduleKind,
  type YearMonth,
} from "@emdia/shared";
import { computed } from "vue";
import MonthDayGrid from "@/components/ui/MonthDayGrid.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Stepper from "@/components/ui/Stepper.vue";
import {
  EVERY_WEEKS_OPTIONS,
  sameDays,
  scheduleSummaryLine,
  WEEKDAY_PRESETS,
  withKind,
} from "@/lib/schedule.ts";
import WeekdayToggles from "./WeekdayToggles.vue";

const model = defineModel<Schedule>({ required: true });
const { month, startedOn, error } = defineProps<{
  /** Month used for the "~N dias em outubro" preview. */
  month: YearMonth;
  startedOn: string;
  error?: string | null;
}>();

const kindOptions = SCHEDULE_KINDS.map((k) => ({ value: k, label: SCHEDULE_KIND_LABEL[k] }));

const kind = computed({
  get: () => model.value.kind,
  set: (k: ScheduleKind) => (model.value = withKind(model.value, k)),
});

function patch(next: Partial<Schedule>): void {
  model.value = { ...model.value, ...next };
}

const weekdays = computed({
  get: () => model.value.weekdays,
  set: (weekdays) => patch({ weekdays }),
});
const everyWeeks = computed({
  get: () => model.value.everyWeeks,
  set: (everyWeeks) => patch({ everyWeeks }),
});
const monthDays = computed({
  get: () => model.value.monthDays,
  set: (monthDays) => patch({ monthDays }),
});
const visits = computed({
  get: () => model.value.visitsPerMonth ?? 1,
  set: (visitsPerMonth) => patch({ visitsPerMonth }),
});

const summary = computed(() => scheduleSummaryLine(model.value, month, startedOn));
</script>

<template>
  <fieldset class="sf">
    <legend class="label">Frequência</legend>
    <Segmented v-model="kind" :options="kindOptions" label="Frequência" wrap />

    <div v-if="model.kind === 'weekly'" class="sf__body">
      <div class="sf__presets" role="group" aria-label="Atalhos">
        <button
          v-for="p in WEEKDAY_PRESETS"
          :key="p.label"
          type="button"
          class="sf__preset"
          :class="{ 'is-on': sameDays(model.weekdays, p.weekdays) }"
          :aria-pressed="sameDays(model.weekdays, p.weekdays)"
          @click="weekdays = [...p.weekdays]"
        >
          {{ p.label }}
        </button>
      </div>
      <WeekdayToggles v-model="weekdays" label="Dias da semana" />
      <div class="sf__repeat">
        <span class="label">repete</span>
        <Segmented
          v-model="everyWeeks"
          :options="EVERY_WEEKS_OPTIONS"
          label="Repete a cada quantas semanas"
        />
      </div>
    </div>

    <div v-else-if="model.kind === 'month_days'" class="sf__body">
      <MonthDayGrid v-model="monthDays" label="Datas do mês" :invalid="!!error" />
      <p class="sf__hint">Dias 29, 30 e 31 caem no último dia nos meses mais curtos.</p>
    </div>

    <div v-else-if="model.kind === 'per_month'" class="sf__body">
      <Stepper
        v-model="visits"
        :step="1"
        :min="1"
        :max="31"
        label="Vezes por mês"
        unit="vez"
        :format="(v) => (v === 1 ? '1 vez por mês' : `${v} vezes por mês`)"
      />
      <p class="sf__hint">Sem data fixa: o cartão conta as visitas do mês.</p>
    </div>

    <p v-else class="sf__hint sf__body">
      Sem dias previstos. Os dias são anotados quando acontecem, e nada aparece como “sem registro”.
    </p>

    <p class="sf__summary mono" aria-live="polite">{{ summary }}</p>
    <p v-if="error" class="sf__error" role="alert">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.sf {
  border: 0;
  padding: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-3);
}

.sf legend {
  padding: 0;
  margin-bottom: var(--s-3);
}

.sf__body {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-4);
  background: var(--sheet);
  border: 1px dashed var(--rule);
  border-radius: var(--r-2);
}

.sf__presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.sf__preset {
  min-height: 44px;
  padding: 0 var(--s-3);
  border: 1px dashed var(--ink-3);
  border-radius: var(--r-1);
  font-size: var(--t-14);
  font-weight: 600;
  color: var(--ink-2);
}

.sf__preset:hover {
  border-color: var(--ink);
  color: var(--ink);
}

.sf__preset.is-on {
  border-style: solid;
  border-color: var(--blue);
  color: var(--blue);
  background: var(--blue-wash);
}

.sf__repeat {
  display: grid;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

.sf__hint {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.sf__summary {
  font-size: var(--t-12);
  color: var(--blue);
  padding-left: var(--s-3);
  border-left: 3px solid var(--blue);
}

.sf__error {
  font-size: var(--t-14);
  color: var(--red-text);
}
</style>
