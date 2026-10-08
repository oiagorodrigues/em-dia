<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  describeSchedule,
  formatCents,
  formatDuration,
  monthName,
  nowInZone,
  parseYearMonth,
  shiftMonth,
  toYearMonth,
  estimateMonthCost,
  expectedDatesInMonth,
  type IsoDate,
  type WorkEntry,
} from "@emdia/shared";
import { computed, onBeforeUnmount, ref, useTemplateRef } from "vue";
import { contractsApi, entriesApi, errorMessage } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import ClockButton from "@/components/feature/ClockButton.vue";
import BulkFillSheet from "@/components/feature/BulkFillSheet.vue";
import DayEditor from "@/components/feature/DayEditor.vue";
import Ledger from "@/components/feature/Ledger.vue";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import TimeCard from "@/components/feature/TimeCard.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import SkeletonLedger from "@/components/ui/SkeletonLedger.vue";
import SkeletonTimeCard from "@/components/ui/SkeletonTimeCard.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useInvalidate, useResource } from "@/composables/resource.ts";
import { useSwipe } from "@/composables/swipe.ts";
import { clockStateOf } from "@/lib/entry.ts";
import { attendanceLabel, attendanceText } from "@/lib/schedule.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import { describeEstimate, estimateGap, isWritable } from "@/lib/contract.ts";

const auth = useAuthStore();
const toast = useToastStore();
const { contract, month, currentMonth, setMonth } = useContract();

const today = nowInZone(DEFAULT_TIMEZONE).date;
const minMonth = computed(() => toYearMonth(contract.value.startedOn));
const maxMonth = computed(() =>
  contract.value.endedOn ? toYearMonth(contract.value.endedOn) : shiftMonth(currentMonth, 12),
);

const scope = computed(() => ({ id: contract.value.id, month: month.value }));
const entries = useResource(scope, queryKeys.entries, (s) =>
  entriesApi.list(s.id, s.month).then((r) => r.entries),
);
const summary = useResource(scope, queryKeys.summary, (s) =>
  contractsApi.summary(s.id, s.month).then((r) => r.summary),
);
const invalidate = useInvalidate();

const monthModel = computed({ get: () => month.value, set: setMonth });

const cardWrap = useTemplateRef<HTMLElement>("cardWrap");
useSwipe(cardWrap, {
  left: () => {
    const next = shiftMonth(month.value, 1);
    if (next <= maxMonth.value) setMonth(next);
  },
  right: () => {
    const prev = shiftMonth(month.value, -1);
    if (prev >= minMonth.value) setMonth(prev);
  },
});

const editorOpen = ref(false);
const editingDate = ref<IsoDate | null>(null);
const editingEntry = computed(
  () => entries.data.value?.find((e) => e.date === editingDate.value) ?? null,
);
const freshDate = ref<IsoDate | null>(null);

function openDay(date: IsoDate): void {
  editingDate.value = date;
  editorOpen.value = true;
}

function upsertLocal(entry: WorkEntry): void {
  entries.mutate((list = []) => {
    const others = list.filter((e) => e.date !== entry.date);
    return [...others, entry].sort((a, b) => a.date.localeCompare(b.date));
  });
  reloadSummarySoon();
}

function removeLocal(date: IsoDate): void {
  entries.mutate((list = []) => list.filter((e) => e.date !== date));
  reloadSummarySoon();
}

/** Bulk actions save one day at a time; recompute the totals once they settle, not per day. */
let summaryTimer: ReturnType<typeof setTimeout> | undefined;
function reloadSummarySoon(): void {
  clearTimeout(summaryTimer);
  const id = contract.value.id;
  summaryTimer = setTimeout(() => void invalidate.records(id, entries), 400);
}
onBeforeUnmount(() => clearTimeout(summaryTimer));

const period = computed(() => ({
  startedOn: contract.value.startedOn,
  endedOn: contract.value.endedOn,
}));
/** The summary is the source of truth; computing locally only avoids an empty frame while it loads. */
const expectedDates = computed(
  () =>
    summary.data.value?.expectedDates ??
    expectedDatesInMonth(contract.value.schedule, month.value, period.value),
);
const unrecorded = computed(() => {
  const recorded = new Set(entries.data.value?.map((e) => e.date) ?? []);
  return expectedDates.value.filter((d) => d <= today && !recorded.has(d));
});
const bulkOpen = ref(false);

/** Only explain marks that actually appear on this month's card. */
const legend = computed(() => {
  const list = entries.data.value ?? [];
  const confirmable = !!contract.value.workerId;
  return {
    ok: confirmable && list.some((e) => e.confirmedAt),
    open: confirmable && list.some((e) => !e.confirmedAt),
    today: month.value === currentMonth,
  };
});
const kind = computed(() => contract.value.schedule.kind);

/** Days the *other* party wrote that still need my confirmation. */
const toConfirm = computed(
  () => entries.data.value?.filter((e) => !e.confirmedAt && e.createdBy !== auth.user?.id) ?? [],
);
const confirmingAll = ref(false);
async function confirmAll(): Promise<void> {
  confirmingAll.value = true;
  let failed = 0;
  for (const e of toConfirm.value) {
    try {
      const res = await entriesApi.confirm(contract.value.id, e.date);
      upsertLocal(res.entry);
    } catch {
      failed++;
    }
  }
  confirmingAll.value = false;
  if (failed)
    toast.error(
      `${failed} ${failed === 1 ? "dia não foi confirmado" : "dias não foram confirmados"}.`,
    );
  else toast.success("Tudo confirmado.");
}

const isCurrent = computed(() => month.value === currentMonth);
/** A month ahead only has the estimate; its ledger is a projection, never mixed with actuals. */
const future = computed(() => month.value > currentMonth);
const projection = computed(() => {
  const e = estimateMonthCost(contract.value, month.value);
  const lines = [
    {
      label: kind.value === "per_month" ? "Visitas previstas" : "Dias previstos",
      value: String(e.days),
    },
    ...(e.minutesPerDay !== null
      ? [{ label: "Horas previstas", value: formatDuration(e.days * e.minutesPerDay) }]
      : []),
  ];
  const why = describeEstimate(e, contract.value);
  return {
    lines: why ? [...lines, { label: "Conta", value: why }] : lines,
    total: {
      label: auth.isEmployer ? "A pagar previsto" : "A receber previsto",
      value: e.cents === null ? "—" : formatCents(e.cents),
    },
    gap: e.cents === null ? estimateGap(contract.value) : null,
  };
});
const active = computed(() => isWritable(contract.value));
const todayEntry = computed(() => entries.data.value?.find((e) => e.date === today) ?? null);
const showClock = computed(
  () => auth.isEmployer && active.value && isCurrent.value && !!entries.data.value,
);
const clocking = ref(false);
async function onClock(action: "in" | "out"): Promise<void> {
  clocking.value = true;
  try {
    const res = await entriesApi.clock(contract.value.id, action);
    freshDate.value = res.entry.date;
    upsertLocal(res.entry);
    toast.success(
      action === "in" ? `Entrada às ${res.entry.checkIn}.` : `Saída às ${res.entry.checkOut}.`,
    );
  } catch (e) {
    toast.error(errorMessage(e));
    void entries.reload();
  } finally {
    clocking.value = false;
  }
}

const ledger = computed(() => {
  const s = summary.data.value;
  if (!s) return null;
  const rateLine =
    s.payType === "hourly"
      ? {
          label: "Valor",
          hint: `${formatDuration(s.totalMinutes)} × ${formatCents(s.rateCents)}`,
          value: formatCents(s.grossCents),
        }
      : s.payType === "daily"
        ? {
            label: "Valor",
            hint:
              s.grossCents === s.daysWorked * s.rateCents
                ? `${s.daysWorked} × ${formatCents(s.rateCents)}`
                : `${s.daysWorked} diárias, em proporção às horas`,
            value: formatCents(s.grossCents),
          }
        : s.payType === "shift"
          ? {
              label: "Plantões",
              hint: `${formatDuration(s.totalMinutes)} ÷ 24h`,
              value: formatCents(s.grossCents),
            }
          : s.payType === "biweekly"
            ? {
                label: "Salário",
                hint: `2 × ${formatCents(s.rateCents)}`,
                value: formatCents(s.grossCents),
              }
            : { label: "Salário", value: formatCents(s.grossCents) };
  const lines = [
    { label: "Horas", value: formatDuration(s.totalMinutes) },
    { label: attendanceLabel(kind.value), value: attendanceText(s, kind.value) },
    ...(s.absences ? [{ label: "Faltas", value: String(s.absences), tone: "red" as const }] : []),
    ...(s.excused ? [{ label: "Faltas justificadas", value: String(s.excused) }] : []),
    ...(s.daysOff + s.holidays
      ? [{ label: "Folgas e feriados", value: String(s.daysOff + s.holidays) }]
      : []),
    rateLine,
    ...(s.absenceDeductionCents > 0
      ? [
          {
            label: "Faltas descontadas",
            hint: `${s.absences} × ${formatCents(Math.round(s.grossCents / 30))}`,
            value: `− ${formatCents(s.absenceDeductionCents)}`,
            tone: "red" as const,
          },
        ]
      : []),
    ...(s.nightBonusCents > 0
      ? [
          {
            label: "Adicional noturno",
            hint: `${formatDuration(s.nightMinutes)} × 20%`,
            value: `+ ${formatCents(s.nightBonusCents)}`,
          },
        ]
      : []),
    ...(s.adjustmentsCents
      ? [
          {
            label: "Gratificações, vale e descontos",
            value: `${s.adjustmentsCents > 0 ? "+" : "−"} ${formatCents(Math.abs(s.adjustmentsCents))}`,
            tone: s.adjustmentsCents < 0 ? ("red" as const) : ("neutral" as const),
          },
        ]
      : []),
    {
      label: "Já pago",
      value: `− ${formatCents(s.paidCents)}`,
      tone: s.paidCents > 0 ? ("green" as const) : ("neutral" as const),
    },
  ];
  const owed = s.balanceCents;
  const total = {
    label: owed < 0 ? "Pago a mais" : auth.isEmployer ? "A pagar" : "A receber",
    value: formatCents(Math.abs(owed)),
    tone: owed < 0 ? ("red" as const) : ("neutral" as const),
  };
  return { lines, total };
});

const downloading = ref(false);
async function downloadCsv(): Promise<void> {
  downloading.value = true;
  try {
    const { blob, filename } = await contractsApi.statementCsv(contract.value.id, month.value);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? `emdia-${month.value}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    downloading.value = false;
  }
}

const monthLabel = computed(() => monthName(parseYearMonth(month.value).month));
</script>

<template>
  <div class="ct">
    <div class="ct__main">
      <div class="ct__head">
        <MonthSwitcher v-model="monthModel" :min="minMonth" :max="maxMonth" prefix="cartão de" />
        <p class="ct__sched">
          <span>{{ describeSchedule(contract.schedule) }}</span>
          <span v-if="kind === 'per_month' && summary.data.value" class="ct__visits mono">
            Visitas: {{ summary.data.value.daysWorked }} de {{ summary.data.value.expectedDays }}
          </span>
        </p>
      </div>

      <div v-if="toConfirm.length > 0" class="ct__confirm ct__note" role="status">
        <p>
          <strong class="mono">{{ toConfirm.length }}</strong>
          {{
            toConfirm.length === 1
              ? "dia anotado pela outra parte espera"
              : "dias anotados pela outra parte esperam"
          }}
          sua confirmação.
        </p>
        <Button icon="check" :loading="confirmingAll" @click="confirmAll">Confirmar todos</Button>
      </div>

      <div ref="cardWrap" class="ct__card">
        <div
          v-if="entries.loading.value && !entries.data.value"
          aria-busy="true"
          aria-label="Carregando cartão"
        >
          <SkeletonTimeCard :month="month" />
        </div>
        <EmptyState
          v-else-if="entries.error.value"
          tone="error"
          title="Não deu para carregar o cartão."
        >
          {{ entries.error.value.message }}
          <template #actions
            ><Button icon="refresh" @click="entries.reload">Tentar de novo</Button></template
          >
        </EmptyState>
        <TimeCard
          v-else-if="entries.data.value"
          :month="month"
          :entries="entries.data.value"
          :contract="contract"
          :expected-dates="expectedDates"
          :today="today"
          :fresh="freshDate"
          :confirmable="!!contract.workerId"
          @select="openDay"
        />
      </div>

      <ul v-if="legend.ok || legend.open || legend.today" class="ct__legend" aria-label="Legenda">
        <li v-if="legend.ok"><span class="lg lg--ok" /> Confirmado</li>
        <li v-if="legend.open"><span class="lg lg--open" /> Aguardando confirmação</li>
        <li v-if="legend.today"><span class="lg lg--today" /> Hoje</li>
      </ul>
    </div>

    <aside class="ct__aside" aria-label="Ponto e conta do mês">
      <section v-if="showClock" class="ct__clock" aria-label="Bater ponto">
        <ClockButton
          :state="clockStateOf(todayEntry, active)"
          :loading="clocking"
          :size="168"
          @press="onClock"
        />
        <p class="ct__clockhint">
          Bater o ponto por {{ contract.workerName }}.
          <template v-if="contract.workerId"> Fica no seu nome até a confirmação. </template>
        </p>
      </section>

      <div
        v-if="auth.isEmployer && active && unrecorded.length > 0"
        class="ct__bulk ct__note"
        role="status"
      >
        <p>
          <strong class="mono">{{ unrecorded.length }}</strong>
          {{
            unrecorded.length === 1 ? "dia previsto sem registro" : "dias previstos sem registro"
          }}
          neste mês.
        </p>
        <Button icon="check" @click="bulkOpen = true">Marcar como trabalhados</Button>
      </div>

      <section
        class="ct__totals"
        :class="{ 'is-projected': future }"
        aria-labelledby="totals-title"
      >
        <h2 id="totals-title" class="section-title">
          {{ future ? "Previsão de" : "Conta de" }} {{ monthLabel }}
        </h2>
        <template v-if="future">
          <Ledger :lines="projection.lines" :total="projection.total" caption="previsto" />
          <p class="ct__projnote">
            {{
              projection.gap ??
              "Conta feita com os dias previstos no combinado. Faltas e extras mudam o valor quando o mês chegar."
            }}
          </p>
        </template>
        <div v-else-if="summary.loading.value && !summary.data.value" aria-busy="true">
          <SkeletonLedger />
        </div>
        <p v-else-if="summary.error.value" class="form-error">{{ summary.error.value.message }}</p>
        <Ledger v-else-if="ledger" :lines="ledger.lines" :total="ledger.total" />
        <div class="ct__actions">
          <Button
            v-if="
              !future &&
              auth.isEmployer &&
              active &&
              summary.data.value &&
              summary.data.value.balanceCents > 0
            "
            :to="{ path: '/pagamentos/novo', query: { vinculo: contract.id, mes: month } }"
            variant="primary"
            icon="wallet-plus"
            >Registrar pagamento</Button
          >
          <Button icon="download" :loading="downloading" @click="downloadCsv"
            >Baixar planilha</Button
          >
        </div>
      </section>
    </aside>

    <BulkFillSheet
      v-model:open="bulkOpen"
      :contract="contract"
      :dates="unrecorded"
      @saved="upsertLocal"
    />

    <DayEditor
      v-model:open="editorOpen"
      :date="editingDate"
      :entry="editingEntry"
      :contract="contract"
      :today="today"
      @saved="upsertLocal"
      @removed="removeLocal"
      @paid="reloadSummarySoon"
    />
  </div>
</template>

<style scoped>
.ct {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

/* Below lg the two columns dissolve and `order` restores the phone sequence: clock above the card. */
.ct__main,
.ct__aside {
  display: contents;
}

.ct__head {
  order: 1;
  display: grid;
  gap: var(--s-5);
}

.ct__clock {
  order: 2;
}

.ct__confirm {
  order: 3;
}

.ct__bulk {
  order: 4;
}

.ct__card {
  order: 5;
  touch-action: pan-y;
}

.ct__legend {
  order: 6;
}

.ct__totals {
  order: 7;
}

.ct__clock {
  display: flex;
  align-items: center;
  gap: var(--s-5);
  padding: var(--s-4) 0;
}

.ct__clockhint {
  font-size: var(--t-14);
  color: var(--ink-2);
  max-width: 28ch;
}

.ct__sched {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-1) var(--s-4);
  margin-top: calc(var(--s-3) * -1);
  font-size: var(--t-14);
  color: var(--ink-2);
}

.ct__visits {
  font-size: var(--t-12);
  color: var(--brand);
}

.ct__note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4);
  background: var(--brand-wash);
  border-radius: var(--r-1);
  font-size: var(--t-14);
}

.ct__note p {
  flex: 1 1 14rem;
}

.ct__legend {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  font-size: var(--t-12);
  color: var(--ink-2);
  margin-top: calc(var(--s-2) * -1);
}

.ct__legend li {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}

.lg {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.lg--ok {
  background: var(--brand);
}

.lg--open {
  border: 1.5px solid var(--ink-2);
}

.lg--today {
  width: 3px;
  height: 14px;
  border-radius: 0;
  background: var(--brand);
}

.ct__totals {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  box-shadow: var(--shadow-1);
}

.ct__totals.is-projected {
  border-style: dashed;
  box-shadow: none;
}

.ct__projnote {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ct__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-2);
}

@media (max-width: 480px) {
  .ct__clock {
    flex-direction: column;
    text-align: center;
  }
}

@media (min-width: 960px) {
  .ct {
    grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
    gap: var(--s-6);
    align-items: start;
  }
  .ct__main,
  .ct__aside {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-5);
    align-content: start;
  }
  .ct__aside {
    position: sticky;
    top: var(--s-6);
  }
  .ct__head {
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--s-5);
  }
  .ct__sched {
    justify-content: flex-end;
    margin-top: 0;
    text-align: right;
  }
  .ct__clock {
    flex-direction: column;
    text-align: center;
    padding: var(--s-5);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--r-2);
    box-shadow: var(--shadow-1);
  }
  .ct__bulk {
    flex-direction: column;
    align-items: stretch;
  }
  .ct__bulk p {
    flex: none;
  }
}
</style>
