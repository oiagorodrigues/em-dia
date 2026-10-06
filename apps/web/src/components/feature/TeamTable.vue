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
import IconButton from "@/components/ui/IconButton.vue";
import Menu from "@/components/ui/Menu.vue";
import type { MenuItem } from "@/components/ui/menu.ts";
import StatusChip from "@/components/ui/StatusChip.vue";
import { isWritable } from "@/lib/contract.ts";
import { clockStateOf } from "@/lib/entry.ts";
import type { Column, TableState } from "@/lib/table.ts";
import {
  attendanceShort,
  contactPhone,
  TEAM_STATUS_LABEL,
  TEAM_STATUS_TONE,
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
  filter,
  filtersActive = false,
  loading = false,
} = defineProps<{
  items: readonly DashboardItem[];
  state: TableState;
  today: IsoDate;
  month: YearMonth;
  /** "home": the dashboard columns; "full": Equipe, with pay and contact. */
  variant?: "home" | "full";
  filter?: (item: DashboardItem) => boolean;
  filtersActive?: boolean;
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
  if (variant === "home") {
    cols.push({ key: "hoje", label: "Hoje", value: (i) => todayInfo(i, today).text });
  } else {
    cols.push({
      key: "pagamento",
      label: "Pagamento",
      value: (i) => i.contract.rateCents,
      sortable: true,
      sortFirst: "desc",
      hideBelow: "lg",
    });
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
  if (variant === "home") {
    cols.splice(cols.length - 1, 0, {
      key: "dias",
      label: "Dias",
      value: (i) => i.summary.daysWorked,
      format: attendanceShort,
      sortable: true,
      sortFirst: "desc",
      align: "right",
      mono: true,
      hideBelow: "lg",
    });
  }
  if (variant === "full") {
    cols.push(
      {
        key: "contato",
        label: "Contato",
        value: (i) => [contactPhone(i.contract), i.contract.contactEmail].filter(Boolean).join(" "),
        searchable: true,
        hideBelow: "xl",
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

async function clock(item: DashboardItem): Promise<void> {
  const state = clockStateOf(item.today, isWritable(item.contract));
  if (state !== "in" && state !== "out") return;
  busy.value = item.contract.id;
  try {
    const { entry } = await entriesApi.clock(item.contract.id, state);
    toast.success(
      state === "in"
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

function clockLabel(item: DashboardItem): string | null {
  if (!isCurrentMonth.value) return null;
  const state = clockStateOf(item.today, isWritable(item.contract));
  if (state === "in") return `Bater entrada de ${item.contract.workerName}`;
  if (state === "out") return `Bater saída de ${item.contract.workerName}`;
  return null;
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

function menuFor(item: DashboardItem): MenuItem[] {
  const status = teamStatus(item.contract);
  const id = item.contract.id;
  if (status === "archived") {
    return [{ label: "restaurar", icon: "undo", onSelect: () => void restore(item) }];
  }
  const list: MenuItem[] = [];
  if (status === "pending") {
    list.push({
      label: item.contract.contactEmail ? "reenviar convite" : "copiar link do convite",
      icon: item.contract.contactEmail ? "mail" : "link",
      onSelect: () => void sendInvite(item),
    });
  }
  list.push(
    { label: "editar", icon: "pencil", onSelect: () => void navigateTo(`/equipe/${id}/ajustes`) },
    { label: "remover", icon: "archive", danger: true, onSelect: () => askRemove(item) },
  );
  return list;
}

function navigateTo(path: string): Promise<unknown> {
  return router.push(path);
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
            tone="butter"
            class="tt__chip"
            >convite pendente</StatusChip
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
        <dl class="tt__nums">
          <div>
            <dt>horas</dt>
            <dd class="mono">{{ formatDuration(row.summary.totalMinutes) }}</dd>
          </div>
          <div>
            <dt>{{ row.contract.schedule.kind === "per_month" ? "visitas" : "dias" }}</dt>
            <dd class="mono">{{ attendanceShort(row) }}</dd>
          </div>
          <div>
            <dt>a pagar</dt>
            <dd class="mono">{{ formatCents(Math.max(0, row.summary.balanceCents)) }}</dd>
          </div>
        </dl>
        <span class="tt__card-foot">
          <StatusChip :tone="TEAM_STATUS_TONE[teamStatus(row.contract)]">{{
            TEAM_STATUS_LABEL[teamStatus(row.contract)]
          }}</StatusChip>
          <span
            v-if="variant === 'home'"
            class="tt__today"
            :class="`is-${todayInfo(row, today).state}`"
          >
            <span class="tt__today-dot" aria-hidden="true" />hoje: {{ todayInfo(row, today).text }}
          </span>
        </span>
      </div>
    </template>

    <template #row-actions="{ row }">
      <template v-if="teamStatus(row.contract) === 'archived'">
        <IconButton
          icon="undo"
          :label="`Restaurar ${row.contract.workerName}`"
          tone="blue"
          @click="restore(row)"
        />
      </template>
      <template v-else>
        <IconButton
          v-if="variant === 'home' && clockLabel(row)"
          icon="clock"
          :label="clockLabel(row)!"
          tone="blue"
          :loading="busy === row.contract.id"
          @click="clock(row)"
        />
        <IconButton
          v-if="isWritable(row.contract)"
          icon="wallet"
          :label="`Registrar pagamento de ${row.contract.workerName}`"
          :to="{ path: '/pagamentos/novo', query: { vinculo: row.contract.id, mes: month } }"
        />
        <IconButton
          icon="card"
          :label="`Ver cartão de ${row.contract.workerName}`"
          :to="{ path: `/equipe/${row.contract.id}`, query: { mes: month } }"
        />
      </template>
      <Menu :items="menuFor(row)" :label="`Mais ações para ${row.contract.workerName}`" />
    </template>
  </DataTable>

  <ConfirmDialog
    v-model:open="confirmOpen"
    :title="`remover ${removing?.contract.workerName ?? ''}?`"
    message="O histórico fica guardado e você pode restaurar em Equipe → removidos."
    confirm-label="remover"
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
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-wash);
}

.tt__today.is-done .tt__today-dot {
  border: 0;
  background: var(--ink-3);
}

.tt__today.is-absent {
  color: var(--red-text);
}

.tt__today.is-absent .tt__today-dot {
  border-color: var(--red);
  background: var(--red);
}

.tt__today.is-waiting .tt__today-dot {
  border-style: dashed;
  border-color: var(--blue);
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
  text-transform: uppercase;
  color: var(--ink-2);
}

.tt__nums dd {
  font-size: var(--t-16);
  font-weight: 600;
}

.tt__card-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
}
</style>
