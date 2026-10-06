<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  formatCents,
  formatDuration,
  monthName,
  nowInZone,
  parseYearMonth,
  shiftMonth,
  toYearMonth,
  type IsoDate,
  type WorkEntry,
} from "@ponto/shared";
import { computed, ref, useTemplateRef } from "vue";
import { contractsApi, entriesApi, errorMessage } from "@/api";
import ClockButton from "@/components/feature/ClockButton.vue";
import DayEditor from "@/components/feature/DayEditor.vue";
import Ledger from "@/components/feature/Ledger.vue";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import TimeCard from "@/components/feature/TimeCard.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useResource } from "@/composables/resource.ts";
import { useSwipe } from "@/composables/swipe.ts";
import { clockStateOf } from "@/lib/entry.ts";
import { firstName } from "@/lib/format.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const { contract, month, currentMonth, setMonth } = useContract();

const today = nowInZone(DEFAULT_TIMEZONE).date;
const minMonth = computed(() => toYearMonth(contract.value.startedOn));
const maxMonth = computed(() =>
  contract.value.endedOn ? toYearMonth(contract.value.endedOn) : shiftMonth(currentMonth, 1),
);

const key = computed(() => `${contract.value.id}|${month.value}`);
const entries = useResource(key, () =>
  entriesApi.list(contract.value.id, month.value).then((r) => r.entries),
);
const summary = useResource(key, () =>
  contractsApi.summary(contract.value.id, month.value).then((r) => r.summary),
);

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
  void summary.reload();
}

function removeLocal(date: IsoDate): void {
  entries.mutate((list = []) => list.filter((e) => e.date !== date));
  void summary.reload();
}

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
const active = computed(() => contract.value.status === "active");
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
            hint: `${s.daysWorked} × ${formatCents(s.rateCents)}`,
            value: formatCents(s.grossCents),
          }
        : { label: "Salário", value: formatCents(s.grossCents) };
  const lines = [
    { label: "Horas", value: formatDuration(s.totalMinutes) },
    { label: "Dias trabalhados", value: `${s.daysWorked} de ${s.expectedDays}` },
    ...(s.absences ? [{ label: "Faltas", value: String(s.absences), tone: "red" as const }] : []),
    ...(s.excused ? [{ label: "Faltas justificadas", value: String(s.excused) }] : []),
    ...(s.daysOff + s.holidays
      ? [{ label: "Folgas e feriados", value: String(s.daysOff + s.holidays) }]
      : []),
    rateLine,
    ...(s.adjustmentsCents
      ? [
          {
            label: "Extras e descontos",
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
    a.download = filename ?? `ponto-${month.value}.csv`;
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
    <MonthSwitcher v-model="monthModel" :min="minMonth" :max="maxMonth" prefix="cartão de" />

    <section v-if="showClock" class="ct__clock" aria-label="Bater ponto">
      <ClockButton
        :state="clockStateOf(todayEntry, active)"
        :loading="clocking"
        :size="168"
        @press="onClock"
      />
      <p class="ct__clockhint">
        Bater o ponto por {{ firstName(contract.workerName) }}.
        <template v-if="contract.workerId">
          Fica no seu nome até {{ firstName(contract.workerName) }} confirmar.
        </template>
      </p>
    </section>

    <div v-if="toConfirm.length > 0" class="ct__confirm" role="status">
      <p>
        <strong class="mono">{{ toConfirm.length }}</strong>
        {{
          toConfirm.length === 1
            ? "dia anotado pela outra parte espera"
            : "dias anotados pela outra parte esperam"
        }}
        sua confirmação.
      </p>
      <Button icon="check" :loading="confirmingAll" @click="confirmAll">confirmar todos</Button>
    </div>

    <div ref="cardWrap" class="ct__card">
      <div
        v-if="entries.loading.value && !entries.data.value"
        class="ct__skel"
        aria-busy="true"
        aria-label="Carregando cartão"
      >
        <Skeleton v-for="i in 10" :key="i" h="38px" :gap="i === 1 ? '0' : '8px'" />
      </div>
      <EmptyState
        v-else-if="entries.error.value"
        tone="error"
        title="Não deu para carregar o cartão."
      >
        {{ entries.error.value.message }}
        <template #actions><Button @click="entries.reload">tentar de novo</Button></template>
      </EmptyState>
      <TimeCard
        v-else-if="entries.data.value"
        :month="month"
        :entries="entries.data.value"
        :contract="contract"
        :today="today"
        :fresh="freshDate"
        :confirmable="!!contract.workerId"
        @select="openDay"
      />
    </div>

    <ul class="ct__legend" aria-label="Legenda">
      <template v-if="contract.workerId">
        <li><span class="lg lg--ok" /> confirmado</li>
        <li><span class="lg lg--open" /> aguardando confirmação</li>
      </template>
      <li><span class="lg lg--today" /> hoje</li>
    </ul>

    <section class="ct__totals" aria-labelledby="totals-title">
      <h2 id="totals-title" class="section-title">conta de {{ monthLabel }}</h2>
      <div v-if="summary.loading.value && !summary.data.value" aria-busy="true">
        <Skeleton v-for="i in 5" :key="i" h="18px" :gap="i === 1 ? '0' : '12px'" />
      </div>
      <p v-else-if="summary.error.value" class="form-error">{{ summary.error.value.message }}</p>
      <Ledger v-else-if="ledger" :lines="ledger.lines" :total="ledger.total" />
      <div class="ct__actions">
        <Button
          v-if="
            auth.isEmployer && active && summary.data.value && summary.data.value.balanceCents > 0
          "
          :to="{ path: '/pagamentos/novo', query: { vinculo: contract.id, mes: month } }"
          variant="primary"
          icon="plus"
          >registrar pagamento</Button
        >
        <Button icon="download" :loading="downloading" @click="downloadCsv">baixar planilha</Button>
      </div>
    </section>

    <DayEditor
      v-model:open="editorOpen"
      :date="editingDate"
      :entry="editingEntry"
      :contract="contract"
      :today="today"
      @saved="upsertLocal"
      @removed="removeLocal"
    />
  </div>
</template>

<style scoped>
.ct {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
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

.ct__confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4);
  background: var(--blue-wash);
  border-radius: var(--r-1);
  font-size: var(--t-14);
}

.ct__confirm p {
  flex: 1 1 14rem;
}

.ct__card {
  touch-action: pan-y;
}

.ct__skel {
  padding: var(--s-4);
  background: var(--sheet);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
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
  background: var(--green);
}

.lg--open {
  border: 1.5px solid var(--ink-2);
}

.lg--today {
  width: 3px;
  height: 14px;
  border-radius: 0;
  background: var(--blue);
}

.ct__totals {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5);
  background: var(--sheet);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
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
</style>
