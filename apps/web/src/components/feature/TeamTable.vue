<script setup lang="ts">
import {
  describeSchedule,
  formatCents,
  formatDuration,
  OCCUPATION_LABEL,
  PAY_TYPE_LABEL,
  type DashboardItem,
  type IsoDate,
  type YearMonth,
} from "@emdia/shared";
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { contractsApi, entriesApi, errorMessage } from "@/api";
import Avatar from "@/components/ui/Avatar.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import DataTable from "@/components/ui/DataTable.vue";
import type { InlineAction, MenuItem } from "@/components/ui/menu.ts";
import StatusChip from "@/components/ui/StatusChip.vue";
import TableActions from "@/components/ui/TableActions.vue";
import { isWritable } from "@/lib/contract.ts";
import { clockStateOf } from "@/lib/entry.ts";
import type { Column, TableState } from "@/lib/table.ts";
import {
  attendanceShort,
  contactPhone,
  projectedMinutes,
  TEAM_STATUS_LABEL,
  TEAM_STATUS_TONE,
  teamRowActions,
  teamStatus,
  todayInfo,
} from "@/lib/team.ts";
import { useToastStore } from "@/stores/toast.ts";

const {
  items,
  state,
  today,
  month,
  variant = "home",
  projected = false,
  filter,
  filtersActive = false,
  filterCount,
  loading = false,
} = defineProps<{
  items: readonly DashboardItem[];
  state: TableState;
  today: IsoDate;
  month: YearMonth;
  /** "home": the dashboard columns; "full": Equipe, with pay and contact. */
  variant?: "home" | "full";
  /** A future month: show the estimate ("previsto") instead of actuals, never both. */
  projected?: boolean;
  filter?: (item: DashboardItem) => boolean;
  filtersActive?: boolean;
  filterCount?: number;
  loading?: boolean;
}>();

/** Something changed on the server; the page refetches. */
const emit = defineEmits<{ reload: []; "clear-filters": [] }>();

defineSlots<{
  filters?: () => unknown;
  actions?: () => unknown;
  empty?: () => unknown;
}>();

const toast = useToastStore();
const router = useRouter();
const isCurrentMonth = computed(() => today.startsWith(month));

function projectedHours(i: DashboardItem): string {
  const m = projectedMinutes(i);
  return m === null ? "—" : formatDuration(m);
}

function projectedCost(i: DashboardItem): string {
  return i.estimate.cents === null ? "sem estimativa" : formatCents(i.estimate.cents);
}

const columns = computed<Column<DashboardItem>[]>(() => {
  const cols: Column<DashboardItem>[] = [
    {
      key: "nome",
      label: "Profissional",
      value: (i) => i.contract.workerName,
      // Função and frequência live under the name, but stay searchable.
      search: (i) =>
        `${OCCUPATION_LABEL[i.contract.occupation]} ${describeSchedule(i.contract.schedule)}`,
      sortable: true,
      searchable: true,
    },
  ];
  if (variant === "full") {
    cols.push({
      key: "pagamento",
      label: "Pagamento",
      value: (i) => i.contract.rateCents,
      sortable: true,
      sortFirst: "desc",
      hideBelow: "lg",
    });
  }
  if (projected) {
    cols.push(
      {
        key: "dias",
        label: "Dias previstos",
        value: (i) => i.estimate.days,
        sortable: true,
        sortFirst: "desc",
        align: "right",
        mono: true,
      },
      {
        key: "horas",
        label: "Horas previstas",
        value: (i) => projectedMinutes(i),
        format: projectedHours,
        sortable: true,
        sortFirst: "desc",
        align: "right",
        mono: true,
        hideBelow: "lg",
      },
      {
        key: "custo",
        label: "Custo previsto",
        value: (i) => i.estimate.cents,
        format: projectedCost,
        sortable: true,
        sortFirst: "desc",
        align: "right",
        mono: true,
      },
    );
  } else {
    if (variant === "home" && isCurrentMonth.value) {
      cols.push({ key: "hoje", label: "Hoje", value: (i) => todayInfo(i, today).text });
    }
    cols.push(
      {
        key: "horas",
        label: "Horas",
        value: (i) => i.summary.totalMinutes,
        format: (i) => formatDuration(i.summary.totalMinutes),
        sortable: true,
        sortFirst: "desc",
        align: "right",
        mono: true,
      },
      {
        key: "dias",
        label: "Dias",
        value: (i) => i.summary.daysWorked,
        format: attendanceShort,
        sortable: true,
        sortFirst: "desc",
        align: "right",
        mono: true,
        hideBelow: variant === "full" ? "xl" : "lg",
      },
      {
        key: "apagar",
        label: "A pagar",
        value: (i) => i.summary.balanceCents,
        format: (i) => formatCents(Math.max(0, i.summary.balanceCents)),
        sortable: true,
        sortFirst: "desc",
        align: "right",
        mono: true,
      },
    );
  }
  if (variant === "full") {
    cols.push(
      {
        key: "contato",
        label: "Contato",
        value: (i) => [contactPhone(i.contract), i.contract.contactEmail].filter(Boolean).join(" "),
        searchable: true,
        hideBelow: "2xl",
      },
      {
        key: "status",
        label: "Status",
        value: (i) => TEAM_STATUS_LABEL[teamStatus(i.contract)],
        sortable: true,
      },
    );
  }
  return cols;
});

const busy = ref<string | null>(null);

async function clock(item: DashboardItem, action: "in" | "out"): Promise<void> {
  busy.value = item.contract.id;
  try {
    const { entry } = await entriesApi.clock(item.contract.id, action);
    toast.success(
      action === "in"
        ? `Entrada de ${item.contract.workerName} às ${entry.checkIn}.`
        : `Saída de ${item.contract.workerName} às ${entry.checkOut}.`,
    );
    emit("reload");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busy.value = null;
  }
}

async function sendInvite(item: DashboardItem): Promise<void> {
  try {
    const { invite } = await contractsApi.invite(item.contract.id);
    let copied = false;
    try {
      await navigator.clipboard.writeText(invite.signupUrl);
      copied = true;
    } catch {
      copied = false;
    }
    if (invite.emailSent)
      toast.success(`Convite reenviado para ${item.contract.contactEmail ?? "o e-mail"}.`);
    else if (copied) toast.success("Link do convite copiado. É só colar na conversa.");
    else toast.show(`Código do convite: ${invite.code}`, { timeout: 10000 });
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

const removing = ref<DashboardItem | null>(null);
const confirmOpen = ref(false);
const removeBusy = ref(false);

function askRemove(item: DashboardItem): void {
  removing.value = item;
  confirmOpen.value = true;
}

async function restore(item: DashboardItem): Promise<void> {
  try {
    await contractsApi.restore(item.contract.id);
    toast.success(`${item.contract.workerName} voltou para a equipe.`);
    emit("reload");
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

async function confirmRemove(): Promise<void> {
  const item = removing.value;
  if (!item) return;
  removeBusy.value = true;
  try {
    await contractsApi.remove(item.contract.id);
    confirmOpen.value = false;
    toast.undoable(
      `${item.contract.workerName} não está mais na equipe.`,
      () => void restore(item),
    );
    emit("reload");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    removeBusy.value = false;
  }
}

const cardLink = (item: DashboardItem) => ({
  path: `/equipe/${item.contract.id}`,
  query: { mes: month },
});

/**
 * Most frequent first, at most two inline: bater entrada/saída (today, current month) and
 * registrar pagamento. Everything else lives in the ⋯ menu.
 */
function inlineFor(item: DashboardItem): InlineAction[] {
  const name = item.contract.workerName;
  const kinds = teamRowActions(item, {
    currentMonth: isCurrentMonth.value,
    projected,
    clock: clockStateOf(item.today, isWritable(item.contract)),
    writable: isWritable(item.contract),
  });
  return kinds.map((kind): InlineAction => {
    switch (kind) {
      case "restore":
        return {
          label: `Restaurar ${name}`,
          icon: "undo",
          tone: "brand",
          onClick: () => void restore(item),
        };
      case "clock-in":
      case "clock-out":
        return {
          label: kind === "clock-in" ? `Bater entrada de ${name}` : `Bater saída de ${name}`,
          icon: kind,
          tone: kind === "clock-in" ? "brand" : "amber",
          loading: busy.value === item.contract.id,
          onClick: () => void clock(item, kind === "clock-in" ? "in" : "out"),
        };
      case "pay":
        return {
          label: `Registrar pagamento de ${name}`,
          icon: "wallet-plus",
          tone: "brand",
          to: { path: "/pagamentos/novo", query: { vinculo: item.contract.id, mes: month } },
        };
    }
  });
}

function menuFor(item: DashboardItem): MenuItem[] {
  const status = teamStatus(item.contract);
  const id = item.contract.id;
  const list: MenuItem[] = [
    { label: "Ver cartão", icon: "eye", onSelect: () => void router.push(cardLink(item)) },
  ];
  if (status === "archived") return list;
  if (status === "pending") {
    list.push({
      label: item.contract.contactEmail ? "Reenviar convite" : "Copiar link do convite",
      icon: item.contract.contactEmail ? "mail" : "link",
      onSelect: () => void sendInvite(item),
    });
  }
  list.push(
    { label: "Editar", icon: "pencil", onSelect: () => void router.push(`/equipe/${id}/ajustes`) },
    { label: "Remover", icon: "trash", danger: true, onSelect: () => askRemove(item) },
  );
  return list;
}
</script>

<template>
  <DataTable
    label="Equipe"
    :rows="items"
    :columns="columns"
    :row-key="(i) => i.contract.id"
    :state="state"
    :filter="filter"
    :filters-active="filtersActive"
    :loading="loading"
    :row-link="(i) => `/equipe/${i.contract.id}`"
    search-placeholder="Buscar por nome, função ou frequência"
    :count-label="(n) => (n === 1 ? '1 pessoa' : `${n} pessoas`)"
    card-actions="below"
    :filter-count="filterCount"
    @clear-filters="emit('clear-filters')"
  >
    <template v-if="$slots.filters" #filters><slot name="filters" /></template>
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    <template v-if="$slots.empty" #empty><slot name="empty" /></template>

    <template #cell-nome="{ row }">
      <span class="tt__who">
        <Avatar :name="row.contract.workerName" :size="36" />
        <span class="tt__who-text">
          <RouterLink :to="`/equipe/${row.contract.id}`" class="tt__name">{{
            row.contract.workerName
          }}</RouterLink>
          <span class="tt__sub"
            >{{ OCCUPATION_LABEL[row.contract.occupation] }} ·
            {{ describeSchedule(row.contract.schedule) }}</span
          >
          <StatusChip
            v-if="variant === 'home' && teamStatus(row.contract) === 'pending'"
            tone="amber"
            class="tt__chip"
            >Convite pendente</StatusChip
          >
        </span>
      </span>
    </template>

    <template #cell-hoje="{ row }">
      <span class="tt__today" :class="`is-${todayInfo(row, today).state}`">
        <span class="tt__today-dot" aria-hidden="true" />{{ todayInfo(row, today).text }}
      </span>
    </template>

    <template #cell-pagamento="{ row }">
      <span class="tt__pay">
        <span class="mono">{{ formatCents(row.contract.rateCents) }}</span>
        <span class="tt__sub">{{ PAY_TYPE_LABEL[row.contract.payType].toLowerCase() }}</span>
      </span>
    </template>

    <template #cell-contato="{ row }">
      <span class="tt__contact">
        <span v-if="contactPhone(row.contract)" class="mono">{{ contactPhone(row.contract) }}</span>
        <span v-if="row.contract.contactEmail" class="tt__sub">{{
          row.contract.contactEmail
        }}</span>
        <span v-if="!contactPhone(row.contract) && !row.contract.contactEmail" class="tt__sub"
          >—</span
        >
      </span>
    </template>

    <template #cell-status="{ row }">
      <StatusChip :tone="TEAM_STATUS_TONE[teamStatus(row.contract)]">{{
        TEAM_STATUS_LABEL[teamStatus(row.contract)]
      }}</StatusChip>
    </template>

    <template #card="{ row }">
      <div class="tt__card">
        <span class="tt__who">
          <Avatar :name="row.contract.workerName" :size="40" />
          <span class="tt__who-text">
            <span class="tt__name">{{ row.contract.workerName }}</span>
            <span class="tt__sub"
              >{{ OCCUPATION_LABEL[row.contract.occupation] }} ·
              {{ describeSchedule(row.contract.schedule) }}</span
            >
          </span>
        </span>
        <dl v-if="projected" class="tt__nums is-projected">
          <div>
            <dt>Dias previstos</dt>
            <dd class="mono">{{ row.estimate.days }}</dd>
          </div>
          <div>
            <dt>Horas previstas</dt>
            <dd class="mono">{{ projectedHours(row) }}</dd>
          </div>
          <div>
            <dt>Custo previsto</dt>
            <dd class="mono">{{ projectedCost(row) }}</dd>
          </div>
        </dl>
        <dl v-else class="tt__nums">
          <div>
            <dt>Horas</dt>
            <dd class="mono">{{ formatDuration(row.summary.totalMinutes) }}</dd>
          </div>
          <div>
            <dt>{{ row.contract.schedule.kind === "per_month" ? "Visitas" : "Dias" }}</dt>
            <dd class="mono">{{ attendanceShort(row) }}</dd>
          </div>
          <div>
            <dt>A pagar</dt>
            <dd class="mono">{{ formatCents(Math.max(0, row.summary.balanceCents)) }}</dd>
          </div>
        </dl>
        <span class="tt__card-foot">
          <StatusChip :tone="TEAM_STATUS_TONE[teamStatus(row.contract)]">{{
            TEAM_STATUS_LABEL[teamStatus(row.contract)]
          }}</StatusChip>
          <span
            v-if="variant === 'home' && isCurrentMonth && !projected"
            class="tt__today"
            :class="`is-${todayInfo(row, today).state}`"
          >
            <span class="tt__today-dot" aria-hidden="true" />Hoje: {{ todayInfo(row, today).text }}
          </span>
        </span>
      </div>
    </template>

    <template #row-actions="{ row }">
      <TableActions
        :actions="inlineFor(row)"
        :menu="menuFor(row)"
        :menu-label="`Mais ações para ${row.contract.workerName}`"
      />
    </template>
  </DataTable>

  <ConfirmDialog
    v-model:open="confirmOpen"
    :title="`Remover ${removing?.contract.workerName ?? ''}?`"
    message="O histórico fica guardado e você pode restaurar em Equipe → removidos."
    confirm-label="Remover"
    :loading="removeBusy"
    @confirm="confirmRemove"
  />
</template>

<style scoped>
.tt__who {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.tt__who-text {
  display: grid;
  min-width: 0;
}

.tt__name {
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

a.tt__name:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.tt__sub {
  font-size: var(--t-12);
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tt__pay,
.tt__contact {
  display: grid;
  min-width: 0;
}

.tt__contact .mono {
  white-space: nowrap;
  font-size: var(--t-12);
}

.tt__contact .tt__sub {
  max-width: 22ch;
}

.tt__chip {
  justify-self: start;
  margin-top: 4px;
  min-height: 22px;
}

.tt__today {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--t-12);
  font-family: var(--font-mono);
  color: var(--ink-2);
  white-space: nowrap;
}

.tt__today-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--ink-3);
}

.tt__today.is-in {
  color: var(--ink);
}

.tt__today.is-in .tt__today-dot {
  border: 0;
  background: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-wash);
}

.tt__today.is-done .tt__today-dot {
  border: 0;
  background: var(--ink-3);
}

.tt__today.is-absent {
  color: var(--coral-ink);
}

.tt__today.is-absent .tt__today-dot {
  border-color: var(--coral);
  background: var(--coral);
}

.tt__today.is-waiting .tt__today-dot {
  border-style: dashed;
  border-color: var(--brand);
}

.tt__card {
  display: grid;
  gap: var(--s-3);
  min-width: 0;
}

.tt__nums {
  display: grid;
  grid-template-columns: repeat(3, auto);
  justify-content: space-between;
  gap: var(--s-3);
}

.tt__nums dt {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--ink-2);
}

.tt__nums dd {
  font-size: var(--t-16);
  font-weight: 600;
}

.tt__nums.is-projected {
  padding: var(--s-2) var(--s-3);
  border: 1px dashed var(--ink-3);
  border-radius: var(--r-1);
}

.tt__card-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
}
</style>
