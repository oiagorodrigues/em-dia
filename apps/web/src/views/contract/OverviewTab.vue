<script setup lang="ts">
import {
  describeSchedule,
  ENTRY_STATUS_LABEL,
  estimateAverageMonthlyCost,
  estimateMonthCost,
  formatCents,
  formatDuration,
  formatYearMonth,
  monthName,
  parseYearMonth,
  PAY_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  shiftMonth,
  toYearMonth,
  weekdayOf,
} from "@emdia/shared";
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { contractsApi, entriesApi, paymentsApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import ContactActions from "@/components/feature/ContactActions.vue";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import KpiCard from "@/components/ui/KpiCard.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useResource } from "@/composables/resource.ts";
import { contactChannels, describeEstimate, estimateGap, isWritable } from "@/lib/contract.ts";
import { ENTRY_TONE } from "@/lib/entry.ts";
import { formatDateShort, WEEKDAY_SHORT } from "@/lib/format.ts";
import { attendanceText } from "@/lib/schedule.ts";
import { useAuthStore } from "@/stores/auth.ts";

const auth = useAuthStore();
const route = useRoute();
const { contract, month, currentMonth, setMonth } = useContract();

const monthModel = computed({ get: () => month.value, set: setMonth });
const minMonth = computed(() => toYearMonth(contract.value.startedOn));
const maxMonth = computed(() =>
  contract.value.endedOn ? toYearMonth(contract.value.endedOn) : shiftMonth(currentMonth, 12),
);
/** Months ahead have no records yet: everything shown is the estimate, labelled "previsto". */
const future = computed(() => month.value > currentMonth);
const monthLabel = computed(() => monthName(parseYearMonth(month.value).month));
const year = computed(() => parseYearMonth(month.value).year);

const scope = computed(() => ({ id: contract.value.id, month: month.value }));
const summary = useResource(scope, queryKeys.summary, (s) =>
  contractsApi.summary(s.id, s.month).then((r) => r.summary),
);
const entries = useResource(scope, queryKeys.entries, (s) =>
  entriesApi.list(s.id, s.month).then((r) => r.entries),
);
const payments = useResource(
  () => ({ id: contract.value.id, year: year.value }),
  queryKeys.payments,
  (s) => paymentsApi.list(s.id, s.year).then((r) => r.payments),
);

const s = computed(() => summary.data.value);
const kind = computed(() => contract.value.schedule.kind);

const projectedKpis = computed(() => {
  const e = estimate.value;
  const unit = kind.value === "per_month" ? "visitas" : "dias";
  return [
    {
      tone: "brand" as const,
      icon: "clock" as const,
      label: "Horas previstas",
      value: e.minutesPerDay === null ? "—" : formatDuration(e.days * e.minutesPerDay),
      amount: e.minutesPerDay === null ? null : e.days * e.minutesPerDay,
      format: formatDuration,
      caption:
        e.minutesPerDay === null
          ? "sem horário combinado"
          : `${formatDuration(e.minutesPerDay)} por dia`,
    },
    {
      tone: "brand" as const,
      icon: "calendar" as const,
      label: `${unit[0]!.toUpperCase()}${unit.slice(1)} previstos`,
      value: String(e.days),
      amount: e.days,
      format: (n: number) => String(Math.round(n)),
      caption: describeSchedule(contract.value.schedule),
    },
    {
      tone: "amber" as const,
      icon: "coins" as const,
      label: auth.isEmployer ? "A pagar previsto" : "A receber previsto",
      value: e.cents === null ? "—" : formatCents(e.cents),
      amount: e.cents,
      format: (n: number) => formatCents(Math.round(n)),
      caption: estimateText.value ?? estimateGap(contract.value),
    },
    {
      tone: "neutral" as const,
      icon: "wallet" as const,
      label: "Média por mês",
      value: average.value === null ? "—" : formatCents(average.value),
      amount: average.value,
      format: (n: number) => formatCents(Math.round(n)),
      caption: "nos próximos 12 meses",
    },
  ];
});

const average = computed(() => estimateAverageMonthlyCost(contract.value, month.value));

const kpis = computed(() => {
  const sum = s.value;
  const owed = sum ? Math.max(0, sum.balanceCents) : 0;
  const paidThisMonth = payments.data.value?.filter((p) => p.referenceMonth === month.value) ?? [];
  return [
    {
      tone: "brand" as const,
      icon: "clock" as const,
      label: "horas",
      value: sum ? formatDuration(sum.totalMinutes) : "",
      caption: `em ${monthLabel.value}`,
    },
    {
      tone: "amber" as const,
      icon: "calendar" as const,
      label: kind.value === "per_month" ? "visitas" : "dias",
      value: sum ? attendanceText(sum, kind.value) : "",
      caption: sum
        ? sum.absences
          ? `${sum.absences} ${sum.absences === 1 ? "falta" : "faltas"}`
          : sum.unrecordedDates.length
            ? `${sum.unrecordedDates.length} sem registro`
            : kind.value === "on_demand"
              ? "sob demanda"
              : "nenhuma falta"
        : undefined,
    },
    {
      tone: "amber" as const,
      icon: "coins" as const,
      label: auth.isEmployer ? "a pagar" : "a receber",
      value: formatCents(owed),
      caption: sum ? `de ${formatCents(sum.dueCents)}` : undefined,
    },
    {
      tone: "brand" as const,
      icon: "wallet" as const,
      label: "pago",
      value: sum ? formatCents(sum.paidCents) : "",
      caption: payments.data.value
        ? paidThisMonth.length === 1
          ? "1 pagamento"
          : `${paidThisMonth.length} pagamentos`
        : undefined,
    },
  ];
});

const estimate = computed(() => estimateMonthCost(contract.value, month.value));
const estimateText = computed(() => describeEstimate(estimate.value, contract.value));
const cost = computed(() => {
  const sum = s.value;
  const est = estimate.value.cents;
  if (!sum) return null;
  const due = sum.dueCents;
  const scale = Math.max(est ?? 0, due, 1);
  const diff = est === null ? null : due - est;
  return {
    est,
    due,
    estPct: est === null ? 0 : Math.round((est / scale) * 100),
    duePct: Math.round((due / scale) * 100),
    diff,
  };
});
const partial = computed(() => month.value === currentMonth);

const rateUnit: Record<string, string> = {
  hourly: "por hora",
  daily: "por diária",
  monthly: "por mês",
};

const terms = computed(() => {
  const c = contract.value;
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Frequência", value: describeSchedule(c.schedule) },
    {
      label: "Horário",
      value:
        c.expectedStart && c.expectedEnd
          ? `${c.expectedStart} às ${c.expectedEnd}`
          : "não combinado",
      mono: !!(c.expectedStart && c.expectedEnd),
    },
    {
      label: "Valor",
      value: `${formatCents(c.rateCents)} ${rateUnit[c.payType]}`,
      mono: true,
    },
    { label: "Forma", value: PAY_TYPE_LABEL[c.payType] },
  ];
  if (c.payType === "monthly")
    rows.push({
      label: "Desconto de faltas",
      value: c.deductAbsences
        ? `sim, ${formatCents(Math.round(c.rateCents / 30))} por falta`
        : "não",
    });
  rows.push({ label: "Início", value: formatDateShort(c.startedOn), mono: true });
  if (c.endedOn) rows.push({ label: "Fim", value: formatDateShort(c.endedOn), mono: true });
  return rows;
});

const channels = computed(() => contactChannels(contract.value));
const hasContact = computed(
  () => !!(channels.value.phone || channels.value.email || channels.value.pixKey),
);

const recent = computed(() =>
  [...(entries.data.value ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
);
const lastPayments = computed(() => payments.data.value?.slice(0, 3) ?? []);

function tabLink(name: string) {
  return { name, params: { id: contract.value.id }, query: route.query };
}
</script>

<template>
  <div class="ov">
    <MonthSwitcher v-model="monthModel" :min="minMonth" :max="maxMonth" prefix="resumo de" />

    <div v-if="future" class="kpi-grid" aria-label="Previsão do mês">
      <KpiCard
        v-for="k in projectedKpis"
        :key="k.label"
        :tone="k.tone"
        :icon="k.icon"
        :label="k.label"
        :value="k.value"
        :amount="k.amount"
        :format="k.format"
        :caption="k.caption"
        projected
      />
    </div>
    <div v-else class="kpi-grid">
      <KpiCard
        v-for="k in kpis"
        :key="k.label"
        :tone="k.tone"
        :icon="k.icon"
        :label="k.label"
        :value="k.value"
        :caption="k.caption"
        :loading="summary.loading.value && !s"
      />
    </div>
    <p v-if="!future && summary.error.value" class="form-error" role="alert">
      {{ summary.error.value.message }}
    </p>

    <div class="page-grid">
      <div class="span-8 ov__col">
        <section v-if="future" class="sheet ov__box is-projected" aria-labelledby="ov-cost">
          <div class="ov__boxhead">
            <h2 id="ov-cost" class="ov__title">Custo previsto de {{ monthLabel }}</h2>
            <span class="ov__tag">previsto</span>
          </div>
          <p class="ov__proj mono">
            {{ estimate.cents === null ? "—" : formatCents(estimate.cents) }}
          </p>
          <p class="ov__why">{{ estimateText ?? estimateGap(contract) }}</p>
          <p class="ov__diff">
            Conta feita com os dias previstos no combinado. Faltas, extras e acordos mudam o valor
            quando o mês chegar.
          </p>
        </section>

        <section v-else class="sheet ov__box" aria-labelledby="ov-cost">
          <div class="ov__boxhead">
            <h2 id="ov-cost" class="ov__title">Custo de {{ monthLabel }}</h2>
            <span v-if="partial" class="ov__hint">realizado até hoje</span>
          </div>
          <div v-if="!cost" aria-busy="true">
            <Skeleton h="20px" />
            <Skeleton h="20px" gap="12px" />
          </div>
          <dl v-else class="ov__bars">
            <div class="ov__bar">
              <dt>
                estimado
                <span class="ov__why">{{ estimateText ?? estimateGap(contract) }}</span>
              </dt>
              <dd class="mono">{{ cost.est === null ? "—" : formatCents(cost.est) }}</dd>
              <span class="ov__track" aria-hidden="true"
                ><span class="ov__fill is-est" :style="{ width: `${cost.estPct}%` }"
              /></span>
            </div>
            <div class="ov__bar">
              <dt>
                realizado
                <span class="ov__why">horas, dias, faltas e extras do mês</span>
              </dt>
              <dd class="mono">{{ formatCents(cost.due) }}</dd>
              <span class="ov__track" aria-hidden="true"
                ><span class="ov__fill is-due" :style="{ width: `${cost.duePct}%` }"
              /></span>
            </div>
          </dl>
          <p v-if="cost && cost.diff !== null && cost.est" class="ov__diff">
            <template v-if="cost.diff === 0">Bateu com o estimado.</template>
            <template v-else>
              <span class="mono">{{ formatCents(Math.abs(cost.diff)) }}</span>
              {{ cost.diff < 0 ? "abaixo" : "acima" }} do estimado{{ partial ? " até agora" : "" }}.
            </template>
          </p>
        </section>

        <section v-if="!future" class="sheet ov__box" aria-labelledby="ov-recent">
          <div class="ov__boxhead">
            <h2 id="ov-recent" class="ov__title">Últimos registros</h2>
            <RouterLink :to="tabLink('contract-card')" class="ov__more">Ver cartão</RouterLink>
          </div>
          <div v-if="entries.loading.value && !entries.data.value" aria-busy="true">
            <Skeleton v-for="i in 3" :key="i" h="36px" :gap="i === 1 ? '0' : '8px'" />
          </div>
          <p v-else-if="recent.length === 0" class="ov__empty">
            Nada anotado em {{ monthLabel }} ainda.
          </p>
          <ul v-else class="ov__list">
            <li v-for="e in recent" :key="e.id" class="ov__entry">
              <span class="ov__date mono"
                ><span class="ov__wd">{{ WEEKDAY_SHORT[weekdayOf(e.date)] }}</span>
                {{ e.date.slice(8) }}/{{ e.date.slice(5, 7) }}</span
              >
              <StatusChip :tone="ENTRY_TONE[e.status]">{{
                ENTRY_STATUS_LABEL[e.status].toLowerCase()
              }}</StatusChip>
              <span class="ov__times mono">
                <template v-if="e.status === 'worked'"
                  >{{ e.checkIn ?? "--:--" }} – {{ e.checkOut ?? "--:--" }}</template
                >
              </span>
              <span class="ov__total mono">{{
                e.status === "worked" && e.checkOut ? formatDuration(e.minutes) : ""
              }}</span>
              <span
                v-if="contract.workerId"
                class="ov__conf"
                :class="{ 'is-ok': e.confirmedAt }"
                :aria-label="e.confirmedAt ? 'confirmado' : 'aguardando confirmação'"
                :title="e.confirmedAt ? 'confirmado' : 'aguardando confirmação'"
              />
            </li>
          </ul>
        </section>

        <section class="sheet ov__box" aria-labelledby="ov-pay">
          <div class="ov__boxhead">
            <h2 id="ov-pay" class="ov__title">Últimos pagamentos</h2>
            <RouterLink :to="tabLink('contract-payments')" class="ov__more">Ver todos</RouterLink>
          </div>
          <div v-if="payments.loading.value && !payments.data.value" aria-busy="true">
            <Skeleton v-for="i in 2" :key="i" h="36px" :gap="i === 1 ? '0' : '8px'" />
          </div>
          <p v-else-if="lastPayments.length === 0" class="ov__empty">
            Nenhum pagamento em <span class="mono">{{ year }}</span
            >.
          </p>
          <ul v-else class="ov__list">
            <li v-for="p in lastPayments" :key="p.id" class="ov__pay">
              <span class="ov__ref">{{ formatYearMonth(p.referenceMonth) }}</span>
              <span class="ov__paid mono">{{ formatDateShort(p.paidOn) }}</span>
              <span class="ov__method">{{ PAYMENT_METHOD_LABEL[p.method] }}</span>
              <span class="ov__amount mono">{{ formatCents(p.amountCents) }}</span>
              <StatusChip :tone="p.acknowledgedAt ? 'brand' : 'amber'">{{
                p.acknowledgedAt ? "recebido" : "sem confirmação"
              }}</StatusChip>
            </li>
          </ul>
        </section>
      </div>

      <aside class="span-4 ov__col">
        <section class="sheet ov__box" aria-labelledby="ov-terms">
          <div class="ov__boxhead">
            <h2 id="ov-terms" class="ov__title">Combinado</h2>
            <RouterLink
              v-if="auth.isEmployer && isWritable(contract)"
              :to="tabLink('contract-settings')"
              class="ov__more"
              >Editar</RouterLink
            >
          </div>
          <dl class="ov__terms">
            <div v-for="t in terms" :key="t.label">
              <dt>{{ t.label }}</dt>
              <dd :class="{ mono: t.mono }">{{ t.value }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="auth.isEmployer" class="sheet ov__box" aria-labelledby="ov-contact">
          <div class="ov__boxhead">
            <h2 id="ov-contact" class="ov__title">Contato</h2>
            <ContactActions v-if="hasContact" :channels="channels" />
          </div>
          <dl v-if="hasContact" class="ov__terms">
            <div v-if="channels.phone">
              <dt>Telefone</dt>
              <dd class="mono">{{ channels.phone }}</dd>
            </div>
            <div v-if="channels.email">
              <dt>E-mail</dt>
              <dd>{{ channels.email }}</dd>
            </div>
            <div v-if="channels.pixKey">
              <dt>Pix</dt>
              <dd class="mono">{{ channels.pixKey }}</dd>
            </div>
          </dl>
          <p v-else class="ov__empty">
            {{
              contract.workerId
                ? `${contract.workerName} ainda não pôs telefone nem Pix no perfil.`
                : "Sem contato. Coloque um e-mail ou telefone em Ajustes para mandar o convite."
            }}
          </p>
          <p v-if="!contract.workerId && hasContact" class="ov__hint">
            Contato que você anotou. Depois que a pessoa entrar, vale o perfil dela.
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ov {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.ov__box.is-projected {
  border-style: dashed;
  box-shadow: none;
}

.ov__tag {
  padding: 2px 8px;
  border: 1px dashed var(--ink-3);
  border-radius: 999px;
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ov__proj {
  font-size: var(--t-28);
  font-weight: 600;
  letter-spacing: -0.03em;
}

.ov__col {
  display: grid;
  gap: var(--s-5);
  align-content: start;
}

.ov__box {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5);
  min-width: 0;
}

.ov__boxhead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2) var(--s-3);
}

.ov__title {
  font-size: var(--t-16);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ov__hint {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ov__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 32px;
  font-size: var(--t-14);
  font-weight: 600;
  color: var(--brand);
  text-decoration: none;
}

.ov__more:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ov__empty {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.ov__bars {
  display: grid;
  gap: var(--s-4);
}

.ov__bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-1) var(--s-3);
  align-items: baseline;
}

.ov__bar dt {
  font-weight: 600;
}

.ov__why {
  display: block;
  font-weight: 400;
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ov__bar dd {
  font-size: var(--t-20);
  font-weight: 600;
}

.ov__track {
  grid-column: 1 / -1;
  height: 10px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.ov__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.ov__fill.is-est {
  background: var(--brand-ink);
  opacity: 0.45;
}

.ov__fill.is-due {
  background: var(--brand-ink);
}

.ov__diff {
  font-size: var(--t-14);
  color: var(--ink-2);
  padding-top: var(--s-3);
  border-top: 1px dashed var(--rule);
}

.ov__diff .mono {
  color: var(--ink);
  font-weight: 600;
}

.ov__list {
  list-style: none;
  padding: 0;
  margin: 0 calc(var(--s-5) * -1);
}

.ov__box .mono {
  font-stretch: 87.5%;
}

.ov__terms dd.mono,
.ov__list .mono {
  font-size: var(--t-12);
}

.ov__list li {
  display: grid;
  align-items: center;
  gap: var(--s-3);
  min-height: 48px;
  padding: var(--s-2) var(--s-5);
  border-top: 1px solid var(--rule);
  font-size: var(--t-14);
}

.ov__entry {
  grid-template-columns: 5.5rem auto minmax(0, 1fr) auto 10px;
}

.ov__pay {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.ov__date {
  white-space: nowrap;
}

.ov__wd {
  display: inline-block;
  width: 3ch;
  color: var(--ink-2);
  font-family: var(--font-text);
  font-size: var(--t-12);
}

.ov__times {
  color: var(--brand);
  white-space: nowrap;
}

.ov__total {
  font-weight: 700;
  white-space: nowrap;
}

.ov__conf {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--ink-2);
}

.ov__conf.is-ok {
  border-color: var(--brand);
  background: var(--brand);
}

.ov__ref {
  font-weight: 600;
}

.ov__paid,
.ov__method {
  display: none;
}

.ov__pay > :last-child {
  justify-self: end;
}

.ov__amount {
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}

.ov__terms {
  display: grid;
}

.ov__terms > div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--s-3);
  padding: var(--s-2) 0;
  border-top: 1px solid var(--rule);
  font-size: var(--t-14);
}

.ov__terms > div:first-child {
  border-top: 0;
  padding-top: 0;
}

.ov__terms dt {
  color: var(--ink-2);
  white-space: nowrap;
}

.ov__terms dd {
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (min-width: 640px) {
  .ov__pay {
    grid-template-columns: minmax(0, 1fr) 6.5rem 6.5rem 7.5rem 8.5rem;
  }
  .ov__paid,
  .ov__method {
    display: block;
    color: var(--ink-2);
  }
}

@media (max-width: 420px) {
  .ov__entry {
    grid-template-columns: 4.5rem auto minmax(0, 1fr) 10px;
  }
  .ov__times {
    display: none;
  }
}
</style>
