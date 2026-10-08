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
  type DashboardItem,
  type Payment,
  type YearMonth,
} from "@emdia/shared";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import { dashboardApi, entriesApi, errorMessage, paymentsApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import ClockButton from "@/components/feature/ClockButton.vue";
import InstallHint from "@/components/feature/InstallHint.vue";
import Ledger, { type LedgerLine } from "@/components/feature/Ledger.vue";
import ReceiptStub from "@/components/feature/ReceiptStub.vue";
import ReceiptViewer from "@/components/feature/ReceiptViewer.vue";
import TodayRow from "@/components/feature/TodayRow.vue";
import Button from "@/components/ui/Button.vue";
import KpiCard from "@/components/ui/KpiCard.vue";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import SkeletonKpi from "@/components/ui/SkeletonKpi.vue";
import SkeletonLedger from "@/components/ui/SkeletonLedger.vue";
import SkeletonMonth from "@/components/ui/SkeletonMonth.vue";
import { useInvalidate, useResource } from "@/composables/resource.ts";
import { clockStateOf } from "@/lib/entry.ts";
import { attendanceLabel, attendanceText } from "@/lib/schedule.ts";
import { firstName } from "@/lib/format.ts";
import { greeting } from "@/lib/greeting.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import { isWritable } from "@/lib/contract.ts";
import { isFutureMonth, projectedMinutes } from "@/lib/team.ts";

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();

const dashboard = useResource(
  () => undefined,
  queryKeys.dashboard,
  () => dashboardApi.get(),
);
const { data, error, loading, reload, mutate } = dashboard;
const invalidate = useInvalidate();

const selectedId = ref<string>("");
watch(
  data,
  (d) => {
    if (!d?.items.length) return;
    if (!d.items.some((i) => i.contract.id === selectedId.value))
      selectedId.value = d.items[0]!.contract.id;
  },
  { immediate: true },
);

const item = computed<DashboardItem | null>(
  () => data.value?.items.find((i) => i.contract.id === selectedId.value) ?? null,
);
const options = computed(
  () =>
    data.value?.items.map((i) => ({ value: i.contract.id, label: i.contract.employerName })) ?? [],
);
const clockState = computed(() =>
  item.value ? clockStateOf(item.value.today, isWritable(item.value.contract)) : "off",
);
const ledgerLines = computed<LedgerLine[]>(() => {
  if (!viewItem.value) return [];
  const { summary, contract } = viewItem.value;
  return [
    {
      label: attendanceLabel(contract.schedule.kind),
      value: attendanceText(summary, contract.schedule.kind),
    },
    { label: "Ganho no mês", value: formatCents(summary.grossCents) },
    ...(summary.absenceDeductionCents > 0
      ? [
          {
            label: "Faltas descontadas",
            value: `− ${formatCents(summary.absenceDeductionCents)}`,
            tone: "red" as const,
          },
        ]
      : []),
    {
      label: "Gratificações, vale e descontos",
      value: formatCents(summary.adjustmentsCents),
      tone: summary.adjustmentsCents < 0 ? "red" : "neutral",
    },
    {
      label: "Já recebido",
      value: formatCents(summary.paidCents),
      tone: summary.paidCents > 0 ? "green" : "neutral",
    },
  ];
});
/*
 * The clock and today's row always use the current month; the right column can browse
 * other months. Past months show what happened, future months only the estimate.
 */
const today = nowInZone(DEFAULT_TIMEZONE).date;
const currentMonth = toYearMonth(today);
const viewMonth = ref<YearMonth>(currentMonth);
const future = computed(() => isFutureMonth(viewMonth.value, today));
/** The current month shares the cache entry (and the request) of the dashboard above. */
const other = useResource(
  () => (viewMonth.value === currentMonth ? undefined : viewMonth.value),
  queryKeys.dashboard,
  (m) => dashboardApi.get(m),
);
const viewItem = computed<DashboardItem | null>(() => {
  if (viewMonth.value === currentMonth) return item.value;
  return other.data.value?.items.find((i) => i.contract.id === selectedId.value) ?? null;
});
const month = computed(() => monthName(parseYearMonth(viewMonth.value).month));
const minMonth = computed(() =>
  item.value ? toYearMonth(item.value.contract.startedOn) : undefined,
);
const projectedHours = computed(() => {
  const m = viewItem.value ? projectedMinutes(viewItem.value) : null;
  return m === null ? "—" : formatDuration(m);
});

const clocking = ref(false);
const freshDate = ref<string | null>(null);

async function onClock(action: "in" | "out"): Promise<void> {
  const current = item.value;
  if (!current || clocking.value) return;
  clocking.value = true;
  try {
    const { entry } = await entriesApi.clock(current.contract.id, action);
    mutate((d) => ({
      ...d!,
      items: d!.items.map((i) =>
        i.contract.id === current.contract.id ? { ...i, today: entry } : i,
      ),
    }));
    freshDate.value = entry.date;
    toast.success(
      action === "in"
        ? `Entrada às ${entry.checkIn} registrada.`
        : `Saída às ${entry.checkOut} registrada.`,
    );
    void invalidate.records(current.contract.id);
  } catch (e) {
    toast.error(errorMessage(e));
    void reload();
  } finally {
    clocking.value = false;
  }
}

const acking = ref(false);
async function acknowledge(payment: Payment): Promise<void> {
  acking.value = true;
  try {
    const { payment: updated } = await paymentsApi.acknowledge(payment.contractId, payment.id);
    mutate((d) => ({
      ...d!,
      items: d!.items.map((i) =>
        i.lastPayment?.id === updated.id ? { ...i, lastPayment: updated } : i,
      ),
    }));
    void invalidate.records(payment.contractId, dashboard);
    toast.success("Recebimento confirmado.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    acking.value = false;
  }
}

const viewerOpen = ref(false);
const viewing = ref<Payment | null>(null);
function view(payment: Payment): void {
  viewing.value = payment;
  viewerOpen.value = true;
}

const clockEl = useTemplateRef<HTMLElement>("clockWrap");
// The "Bater ponto" app shortcut lands on /?bater=1: focus the clock once it renders, never auto-press.
const stopShortcut = watch(
  () => route.query.bater !== undefined && !!item.value,
  async (ready) => {
    if (!ready) return;
    await nextTick();
    clockEl.value?.querySelector("button")?.focus();
    stopShortcut();
  },
  { immediate: true },
);
</script>

<template>
  <div class="wh">
    <header class="wh__head">
      <p class="label">{{ greeting() }}, {{ firstName(auth.user?.name ?? "") }}</p>
      <h1 class="visually-hidden">Início</h1>
      <Button
        v-if="data && data.items.length > 0"
        to="/entrar-no-vinculo"
        icon="key"
        variant="ghost"
        class="wh__join"
        >Entrar em outro vínculo</Button
      >
    </header>

    <div v-if="loading && !data" class="grid grid-cols-12 gap-6 lg:gap-8" aria-busy="true">
      <div class="col-span-12 grid content-start gap-6 lg:col-span-5">
        <div class="wh__clock sheet">
          <Skeleton w="200px" h="200px" round />
          <Skeleton w="60%" h="14px" />
          <Skeleton w="40%" h="12px" />
        </div>
        <div class="wh__today sheet">
          <Skeleton w="45%" h="14px" />
          <div class="wh__todaycols">
            <Skeleton v-for="i in 3" :key="i" w="64px" h="40px" />
          </div>
        </div>
      </div>
      <div class="col-span-12 grid content-start gap-6 lg:col-span-7">
        <SkeletonMonth />
        <div class="kpi-grid"><SkeletonKpi v-for="i in 3" :key="i" /></div>
        <div class="wh__month sheet">
          <div class="wh__monthhead">
            <Skeleton w="40%" h="20px" />
            <Skeleton w="112px" h="44px" />
          </div>
          <SkeletonLedger :total="false" />
        </div>
      </div>
    </div>

    <EmptyState v-else-if="error && !data" tone="error" title="Não deu para carregar o início.">
      {{ error.message }}
      <template #actions><Button icon="refresh" @click="reload">Tentar de novo</Button></template>
    </EmptyState>

    <EmptyState
      v-else-if="data && data.items.length === 0"
      title="Você ainda não está em nenhum vínculo."
    >
      Peça o código de 8 letras para quem te contratou e coloque aqui. Aí é só bater o ponto.
      <template #actions>
        <Button to="/entrar-no-vinculo" variant="primary" icon="key">Tenho um código</Button>
      </template>
    </EmptyState>

    <div v-else-if="data && item" class="grid grid-cols-12 gap-6 lg:gap-8">
      <div class="col-span-12 grid content-start gap-6 lg:sticky lg:top-6 lg:col-span-5">
        <ChoiceField
          v-if="options.length > 1"
          v-model="selectedId"
          :options="options"
          label="Onde você está trabalhando"
        />

        <section ref="clockWrap" class="wh__clock sheet" aria-label="Bater ponto">
          <ClockButton :state="clockState" :loading="clocking" @press="onClock" />
          <p class="wh__where">
            <span class="label">em</span>
            {{ item.contract.householdName }} · {{ item.contract.employerName }}
          </p>
          <p class="wh__sched mono">{{ describeSchedule(item.contract.schedule) }}</p>
        </section>

        <TodayRow :entry="item.today" :date="data.today" :fresh="freshDate === data.today" />

        <InstallHint />
      </div>

      <div class="col-span-12 grid content-start gap-6 lg:col-span-7">
        <MonthSwitcher v-model="viewMonth" :min="minMonth" :max="shiftMonth(currentMonth, 12)" />

        <template v-if="other.loading.value && !viewItem">
          <div class="kpi-grid" aria-busy="true"><SkeletonKpi v-for="i in 3" :key="i" /></div>
          <div class="wh__month sheet" aria-busy="true">
            <div class="wh__monthhead">
              <Skeleton w="40%" h="20px" />
              <Skeleton w="112px" h="44px" />
            </div>
            <SkeletonLedger :total="false" />
          </div>
        </template>

        <section
          v-else-if="viewItem && future"
          class="kpi-grid"
          :aria-label="`Previsão de ${month}`"
        >
          <KpiCard
            projected
            tone="amber"
            icon="coins"
            label="A receber"
            :value="
              viewItem.estimate.cents === null
                ? 'sem estimativa'
                : formatCents(viewItem.estimate.cents)
            "
            caption="se você vier em todos os dias combinados"
          />
          <KpiCard
            projected
            tone="brand"
            icon="calendar"
            :label="viewItem.contract.schedule.kind === 'per_month' ? 'Visitas' : 'Dias'"
            :value="String(viewItem.estimate.days)"
            :caption="describeSchedule(viewItem.contract.schedule)"
          />
          <KpiCard projected tone="brand" icon="clock" label="Horas" :value="projectedHours" />
        </section>

        <template v-else-if="viewItem">
          <section class="kpi-grid" :aria-label="`Resumo de ${month}`">
            <KpiCard
              tone="brand"
              icon="clock"
              :label="`Horas em ${month}`"
              :value="formatDuration(viewItem.summary.totalMinutes)"
              :amount="viewItem.summary.totalMinutes"
              :format="formatDuration"
            />
            <KpiCard
              :tone="viewItem.summary.balanceCents > 0 ? 'amber' : 'brand'"
              icon="coins"
              label="A receber"
              :value="formatCents(Math.max(0, viewItem.summary.balanceCents))"
              :amount="Math.max(0, viewItem.summary.balanceCents)"
              :format="formatCents"
              :caption="`de ${formatCents(viewItem.summary.dueCents)} no mês`"
            />
            <KpiCard
              :tone="viewItem.summary.absences ? 'coral' : 'brand'"
              icon="calendar"
              :label="viewItem.contract.schedule.kind === 'per_month' ? 'Visitas' : 'Dias'"
              :value="attendanceText(viewItem.summary, viewItem.contract.schedule.kind)"
              :caption="
                viewItem.summary.absences
                  ? `${viewItem.summary.absences} ${viewItem.summary.absences === 1 ? 'falta' : 'faltas'}`
                  : 'sem faltas'
              "
            />
          </section>

          <section class="wh__month sheet" aria-labelledby="wh-month">
            <div class="wh__monthhead">
              <h2 id="wh-month" class="section-title">Conta de {{ month }}</h2>
              <Button
                :to="{ path: `/equipe/${viewItem.contract.id}`, query: { mes: viewMonth } }"
                variant="ghost"
                icon="eye"
                >Ver cartão</Button
              >
            </div>
            <Ledger :lines="ledgerLines" />
            <p v-if="viewItem.summary.pendingConfirmation > 0" class="wh__pending">
              {{ viewItem.summary.pendingConfirmation }}
              {{
                viewItem.summary.pendingConfirmation === 1
                  ? "dia aguardando confirmação"
                  : "dias aguardando confirmação"
              }}
            </p>
          </section>
        </template>

        <section v-if="item.lastPayment" class="wh__pay" aria-labelledby="wh-pay">
          <h2 id="wh-pay" class="section-title">Último pagamento</h2>
          <ReceiptStub
            :payment="item.lastPayment"
            can-acknowledge
            :busy="acking"
            @acknowledge="acknowledge(item.lastPayment)"
            @view="view(item.lastPayment)"
          />
        </section>
      </div>
    </div>

    <ReceiptViewer v-model:open="viewerOpen" :payment="viewing" />
  </div>
</template>

<style scoped>
.wh {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

/* A worker can have several households: the code for a new one is always one tap away. */
.wh__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.wh__clock {
  display: grid;
  justify-items: center;
  gap: var(--s-4);
  padding: var(--s-6) var(--s-4);
}

.wh__today {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
}

.wh__todaycols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
}

.wh__sched {
  margin-top: calc(var(--s-3) * -1);
  font-size: var(--t-12);
  color: var(--ink-2);
}

.wh__where {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-2);
  align-items: baseline;
  font-size: var(--t-14);
  color: var(--ink-2);
  text-align: center;
}

.wh__month {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5);
}

.wh__monthhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-3);
}

.wh__pending {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.wh__pay {
  display: grid;
  gap: var(--s-4);
}
</style>
