<script setup lang="ts">
import {
  describeSchedule,
  OCCUPATION_LABEL,
  PAY_TYPE_LABEL,
  type ClockTime,
  type IsoDate,
  type Occupation,
  type PayType,
  type Schedule,
  type YearMonth,
} from "@emdia/shared";
import { computed } from "vue";
import Avatar from "@/components/ui/Avatar.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import { describeEstimate, describeHours, describeRates } from "@/lib/estimate.ts";
import { formatDayMonth } from "@/lib/format.ts";

export interface EstimateDraft {
  workerName: string;
  occupation: Occupation;
  payType: PayType;
  rateCents: number | null;
  schedule: Schedule;
  expectedStart: ClockTime | null;
  expectedEnd: ClockTime | null;
  startedOn: IsoDate;
  contactEmail?: string;
  contactPhone?: string;
}

const { draft, month, today } = defineProps<{
  draft: EstimateDraft;
  /** Month the estimate is for: the start month when it starts later, else this month. */
  month: YearMonth;
  today: IsoDate;
}>();

const name = computed(() => draft.workerName.trim());
const input = computed(() => ({
  payType: draft.payType,
  rateCents: draft.rateCents,
  schedule: draft.schedule,
  expectedStart: draft.expectedStart || null,
  expectedEnd: draft.expectedEnd || null,
  startedOn: draft.startedOn || today,
}));
const estimate = computed(() => describeEstimate(input.value, month));
const rates = computed(() => describeRates(input.value, month));
const frequency = computed(() => {
  const s = draft.schedule;
  const empty =
    (s.kind === "weekly" && s.weekdays.length === 0) ||
    (s.kind === "month_days" && s.monthDays.length === 0);
  return empty ? "escolha os dias" : describeSchedule(s);
});
const hours = computed(() => describeHours(draft.expectedStart, draft.expectedEnd));
const start = computed(() => {
  if (!draft.startedOn) return null;
  return draft.startedOn > today
    ? `começa em ${formatDayMonth(draft.startedOn)}`
    : draft.startedOn === today
      ? "começa hoje"
      : `desde ${formatDayMonth(draft.startedOn)}`;
});
const invite = computed(() => {
  const email = draft.contactEmail?.trim();
  const phone = draft.contactPhone?.trim();
  if (email && phone) return `link de cadastro por e-mail e WhatsApp`;
  if (email) return `link de cadastro para ${email}`;
  if (phone) return "link de cadastro pelo WhatsApp";
  return null;
});
</script>

<template>
  <aside class="ep" aria-labelledby="ep-title">
    <h2 id="ep-title" class="label">Resumo</h2>

    <div class="ep__who">
      <Avatar :name="name || '?'" :size="48" />
      <div class="ep__who-text">
        <p class="ep__name" :class="{ 'is-empty': !name }">{{ name || "sem nome ainda" }}</p>
        <p class="ep__chips">
          <StatusChip tone="brand" :dot="false">{{
            OCCUPATION_LABEL[draft.occupation]
          }}</StatusChip>
          <StatusChip tone="neutral" :dot="false">{{ PAY_TYPE_LABEL[draft.payType] }}</StatusChip>
        </p>
      </div>
    </div>

    <dl class="ep__facts">
      <div>
        <dt class="label">Frequência</dt>
        <dd>{{ frequency }}</dd>
      </div>
      <div v-if="hours">
        <dt class="label">Horário</dt>
        <dd class="mono">{{ hours }}</dd>
      </div>
      <div v-if="start">
        <dt class="label">Início</dt>
        <dd>{{ start }}</dd>
      </div>
      <div v-if="invite">
        <dt class="label">Convite</dt>
        <dd>{{ invite }}</dd>
      </div>
    </dl>

    <section class="ep__cost" aria-live="polite" aria-labelledby="ep-cost">
      <h3 id="ep-cost" class="ep__cost-label">Custo estimado</h3>
      <template v-if="estimate.total">
        <p class="ep__total">
          <span class="mono">{{ estimate.total }}</span>
          <span class="ep__when">{{ estimate.when }}</span>
        </p>
        <p class="ep__breakdown mono">{{ estimate.breakdown }}</p>
        <p v-if="estimate.average" class="ep__avg">{{ estimate.average }}</p>
      </template>
      <p v-else class="ep__reason">{{ estimate.reason }}</p>
    </section>
    <section v-if="rates.length > 1" class="ep__rates" aria-labelledby="ep-rates">
      <h3 id="ep-rates" class="label">Equivale a</h3>
      <dl>
        <div v-for="r in rates" :key="r.label" :class="{ 'is-base': r.base }">
          <dt>{{ r.label }}</dt>
          <dd class="mono">{{ r.value }}</dd>
        </div>
      </dl>
    </section>
    <p class="ep__foot">
      Conta feita com os dias previstos. Faltas, gratificações e descontos mudam o valor do mês.
    </p>
  </aside>
</template>

<style scoped>
.ep {
  display: grid;
  gap: var(--s-5);
  padding: var(--s-6);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  box-shadow: var(--shadow-1);
}

.ep__who {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.ep__who-text {
  display: grid;
  gap: var(--s-1);
  min-width: 0;
}

.ep__name {
  font-size: var(--t-20);
  font-weight: 700;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ep__name.is-empty {
  color: var(--ink-3);
  font-weight: 600;
}

.ep__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
}

.ep__facts {
  display: grid;
  gap: var(--s-3);
}

.ep__facts > div {
  display: grid;
  gap: 2px;
}

.ep__facts dd {
  font-size: var(--t-14);
}

.ep__facts dd.mono {
  font-size: var(--t-12);
  font-stretch: 87.5%;
}

.ep__cost {
  display: grid;
  gap: var(--s-1);
  padding: var(--s-5);
  border-radius: var(--r-2);
  background: var(--surface-2);
  color: var(--ink);
}

.ep__cost-label {
  font-size: var(--t-12);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ep__total {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-1) var(--s-2);
  margin-top: var(--s-1);
}

.ep__total .mono {
  font-size: var(--t-28);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.ep__when {
  font-size: var(--t-14);
  font-weight: 600;
}

.ep__breakdown {
  font-size: var(--t-12);
  font-stretch: 87.5%;
}

.ep__avg {
  margin-top: var(--s-2);
  padding-top: var(--s-2);
  border-top: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  font-size: var(--t-14);
  font-weight: 600;
}

.ep__reason {
  font-size: var(--t-14);
  font-weight: 600;
}

.ep__rates {
  display: grid;
  gap: var(--s-2);
}

.ep__rates dl {
  display: grid;
  gap: var(--s-1);
}

.ep__rates dl > div {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  font-size: var(--t-14);
  color: var(--ink-2);
}

.ep__rates dl > div.is-base {
  color: var(--ink);
  font-weight: 600;
}

.ep__foot {
  font-size: var(--t-12);
  color: var(--ink-2);
}
</style>
