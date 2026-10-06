<script setup lang="ts">
import {
  describeSchedule,
  formatCents,
  formatDuration,
  monthName,
  parseYearMonth,
  type DashboardItem,
  type Payment,
} from "@emdia/shared";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import { dashboardApi, entriesApi, errorMessage, paymentsApi } from "@/api";
import ClockButton from "@/components/feature/ClockButton.vue";
import InstallHint from "@/components/feature/InstallHint.vue";
import Ledger, { type LedgerLine } from "@/components/feature/Ledger.vue";
import ReceiptStub from "@/components/feature/ReceiptStub.vue";
import ReceiptViewer from "@/components/feature/ReceiptViewer.vue";
import TodayRow from "@/components/feature/TodayRow.vue";
import Button from "@/components/ui/Button.vue";
import KpiCard from "@/components/ui/KpiCard.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useResource } from "@/composables/resource.ts";
import { clockStateOf } from "@/lib/entry.ts";
import { attendanceLabel, attendanceText } from "@/lib/schedule.ts";
import { firstName } from "@/lib/format.ts";
import { greeting } from "@/lib/greeting.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import { isWritable } from "@/lib/contract.ts";

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();

const { data, error, loading, reload, mutate } = useResource(
  () => 0,
  () => dashboardApi.get(),
);

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
  if (!item.value) return [];
  const { summary, contract } = item.value;
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
      label: "Extras e descontos",
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
const month = computed(() => (data.value ? monthName(parseYearMonth(data.value.month).month) : ""));

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
    void reload();
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
    <header>
      <p class="label">{{ greeting() }}, {{ firstName(auth.user?.name ?? "") }}</p>
      <h1 class="visually-hidden">Início</h1>
    </header>

    <div v-if="loading && !data" class="wh__clock" aria-busy="true">
      <Skeleton w="200px" h="200px" class="round" />
      <Skeleton h="56px" gap="24px" />
      <Skeleton h="120px" gap="24px" />
    </div>

    <EmptyState v-else-if="error && !data" tone="error" title="Não deu para carregar o início.">
      {{ error.message }}
      <template #actions><Button @click="reload">tentar de novo</Button></template>
    </EmptyState>

    <EmptyState
      v-else-if="data && data.items.length === 0"
      title="Você ainda não está em nenhum vínculo."
    >
      Peça o código de 8 letras para quem te contratou e coloque aqui. Aí é só bater o ponto.
      <template #actions>
        <Button to="/entrar-no-vinculo" variant="primary" icon="key">tenho um código</Button>
      </template>
    </EmptyState>

    <div v-else-if="data && item" class="wh__grid">
      <div class="wh__left">
        <Segmented
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

      <div class="wh__right">
        <section class="wh__kpis" aria-label="Resumo do mês">
          <KpiCard
            tint="mint"
            icon="clock"
            :label="`horas em ${month}`"
            :value="formatDuration(item.summary.totalMinutes)"
          />
          <KpiCard
            tint="peach"
            icon="coins"
            label="a receber"
            :value="formatCents(Math.max(0, item.summary.balanceCents))"
            :caption="`de ${formatCents(item.summary.dueCents)} no mês`"
          />
          <KpiCard
            tint="sky"
            icon="calendar"
            :label="item.contract.schedule.kind === 'per_month' ? 'visitas' : 'dias'"
            :value="attendanceText(item.summary, item.contract.schedule.kind)"
            :caption="item.summary.absences ? `${item.summary.absences} falta(s)` : 'sem faltas'"
          />
        </section>

        <section class="wh__month sheet" aria-labelledby="wh-month">
          <div class="wh__monthhead">
            <h2 id="wh-month" class="section-title">conta de {{ month }}</h2>
            <Button :to="`/equipe/${item.contract.id}`" variant="ghost" icon-right="arrow-right"
              >ver cartão</Button
            >
          </div>
          <Ledger :lines="ledgerLines" />
          <p v-if="item.summary.pendingConfirmation > 0" class="wh__pending">
            {{ item.summary.pendingConfirmation }}
            {{
              item.summary.pendingConfirmation === 1
                ? "dia aguardando confirmação"
                : "dias aguardando confirmação"
            }}
          </p>
        </section>

        <section v-if="item.lastPayment" class="wh__pay" aria-labelledby="wh-pay">
          <h2 id="wh-pay" class="section-title">último pagamento</h2>
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

.wh__grid,
.wh__left,
.wh__right {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
  align-content: start;
}

.wh__clock {
  display: grid;
  justify-items: center;
  gap: var(--s-4);
  padding: var(--s-6) var(--s-4);
}

.wh__clock :deep(.round) {
  border-radius: 50%;
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

.wh__kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}

.wh__kpis > :first-child {
  grid-column: 1 / -1;
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

@media (min-width: 960px) {
  .wh__grid {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: var(--s-7);
  }
  .wh__kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .wh__kpis > :first-child {
    grid-column: auto;
  }
  .wh__left {
    position: sticky;
    top: var(--s-6);
  }
}
</style>
