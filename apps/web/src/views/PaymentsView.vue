<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  formatCents,
  formatYearMonth,
  nowInZone,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  RECEIPT_MIME_TYPES,
  type Payment,
} from "@emdia/shared";
import { computed, ref, useTemplateRef } from "vue";
import { errorMessage, paymentsApi } from "@/api";
import ReceiptStub from "@/components/feature/ReceiptStub.vue";
import ReceiptViewer from "@/components/feature/ReceiptViewer.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import Avatar from "@/components/ui/Avatar.vue";
import Button from "@/components/ui/Button.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import DataTable from "@/components/ui/DataTable.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import KpiCard from "@/components/ui/KpiCard.vue";
import Select from "@/components/ui/Select.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import TableActions from "@/components/ui/TableActions.vue";
import type { InlineAction, MenuItem } from "@/components/ui/menu.ts";
import { useTableState } from "@/composables/tableState.ts";
import { useTeamPayments } from "@/composables/teamPayments.ts";
import { isWritable } from "@/lib/contract.ts";
import { formatDateShort } from "@/lib/format.ts";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import {
  matchesPaymentFilters,
  paymentTotals,
  paymentYears,
  type PaymentRow,
} from "@/lib/payments.ts";
import { receiptProblem } from "@/lib/receipt.ts";
import type { Column } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const wide = useMediaQuery(MQ.md);
const lg = useMediaQuery(MQ.lg);

const thisYear = Number(nowInZone(DEFAULT_TIMEZONE).date.slice(0, 4));
const { state, clear } = useTableState({
  defaultSort: { key: "pago", dir: "desc" },
  filters: ["pessoa", "ano", "forma", "recebido"],
});

const year = computed(() => {
  const n = Number(state.filters.ano);
  return Number.isInteger(n) && n >= 2000 && n <= thisYear ? n : thisYear;
});
const payments = useTeamPayments(() => year.value);

const contracts = computed(() =>
  [...(payments.data.value?.contracts ?? [])].sort((a, b) =>
    personOf(a).localeCompare(personOf(b), "pt-BR"),
  ),
);
const rows = computed(() => payments.data.value?.rows ?? []);

function personOf(c: PaymentRow["contract"]): string {
  return auth.isEmployer ? c.workerName : c.employerName;
}

const yearOptions = computed(() =>
  paymentYears(contracts.value, thisYear).map((y) => ({
    value: y === thisYear ? "" : String(y),
    label: String(y),
  })),
);
const personOptions = computed(() => [
  { value: "", label: auth.isEmployer ? "Todas as pessoas" : "Todas as casas" },
  ...contracts.value.map((c) => ({ value: c.id, label: personOf(c) })),
]);
const methodOptions = [
  { value: "", label: "Todas as formas" },
  ...PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] })),
];
const receivedOptions = [
  { value: "", label: "Recebido ou não" },
  { value: "sim", label: "Recebido" },
  { value: "nao", label: "Sem “recebi”" },
];

function methodText(r: PaymentRow): string {
  const label = PAYMENT_METHOD_LABEL[r.payment.method];
  return r.agreement ? `${label} · ${r.agreement}` : label;
}

const columns = computed<Column<PaymentRow>[]>(() => [
  {
    key: "pessoa",
    label: auth.isEmployer ? "Pessoa" : "Quem pagou",
    value: (r) => personOf(r.contract),
    sortable: true,
    searchable: true,
  },
  {
    key: "ref",
    label: "Referência",
    value: (r) => r.payment.referenceMonth,
    format: (r) => formatYearMonth(r.payment.referenceMonth),
    sortable: true,
    sortFirst: "desc",
    searchable: true,
  },
  {
    key: "pago",
    label: "Pago em",
    value: (r) => r.payment.paidOn,
    format: (r) => formatDateShort(r.payment.paidOn),
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
  {
    key: "valor",
    label: "Valor",
    value: (r) => r.payment.amountCents,
    format: (r) => formatCents(r.payment.amountCents),
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
  {
    key: "forma",
    label: "Forma",
    value: (r) => `${methodText(r)} ${r.payment.note ?? ""}`,
    sortable: true,
    searchable: true,
    hideBelow: "lg",
  },
  { key: "comprovante", label: "Comprovante", value: (r) => !!r.payment.receipt },
  {
    key: "recebido",
    label: "Recebido",
    value: (r) => !!r.payment.acknowledgedAt,
    sortable: true,
  },
]);

const filter = (r: PaymentRow) =>
  matchesPaymentFilters(r, {
    pessoa: state.filters.pessoa,
    forma: state.filters.forma,
    recebido: state.filters.recebido,
  });
const filterCount = computed(
  () =>
    [state.filters.pessoa, state.filters.forma, state.filters.recebido, state.filters.ano].filter(
      Boolean,
    ).length,
);
const yearTotals = computed(() => paymentTotals(rows.value.filter(filter)));

function onClear(): void {
  clear();
}

const busyId = ref<string | null>(null);
async function run(row: PaymentRow, task: () => Promise<void>): Promise<void> {
  busyId.value = row.payment.id;
  try {
    await task();
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

function replace(updated: Payment): void {
  payments.mutate((prev) => ({
    contracts: prev?.contracts ?? [],
    rows: (prev?.rows ?? []).map((r) =>
      r.payment.id === updated.id ? { ...r, payment: updated } : r,
    ),
  }));
}

function acknowledge(row: PaymentRow): Promise<void> {
  return run(row, async () => {
    replace((await paymentsApi.acknowledge(row.contract.id, row.payment.id)).payment);
    toast.success("Recebimento confirmado.");
  });
}

const viewerOpen = ref(false);
const viewing = ref<Payment | null>(null);
function view(p: Payment): void {
  viewing.value = p;
  viewerOpen.value = true;
}

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const attaching = ref<PaymentRow | null>(null);
function pickReceipt(row: PaymentRow): void {
  attaching.value = row;
  fileInput.value?.click();
}
function onFile(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  const row = attaching.value;
  if (!file || !row) return;
  const problem = receiptProblem(file);
  if (problem) {
    toast.error(problem);
    return;
  }
  const form = new FormData();
  form.append("receipt", file);
  void run(row, async () => {
    replace((await paymentsApi.replaceReceipt(row.contract.id, row.payment.id, form)).payment);
    toast.success("Comprovante anexado.");
  });
}

const removing = ref<PaymentRow | null>(null);
const removeOpen = ref(false);
function askRemove(row: PaymentRow): void {
  removing.value = row;
  removeOpen.value = true;
}
async function confirmRemove(): Promise<void> {
  const row = removing.value;
  if (!row) return;
  await run(row, async () => {
    await paymentsApi.remove(row.contract.id, row.payment.id);
    payments.mutate((prev) => ({
      contracts: prev?.contracts ?? [],
      rows: (prev?.rows ?? []).filter((r) => r.payment.id !== row.payment.id),
    }));
    toast.success("Pagamento removido.");
  });
  removeOpen.value = false;
}

function inlineActions(row: PaymentRow): InlineAction[] {
  const out: InlineAction[] = [];
  if (auth.isWorker && !row.payment.acknowledgedAt)
    out.push({
      label: "Recebi",
      icon: "check",
      tone: "brand",
      loading: busyId.value === row.payment.id,
      onClick: () => void acknowledge(row),
    });
  out.push({
    label: "Ver pagamentos",
    icon: "eye",
    to: {
      path: `/equipe/${row.contract.id}/pagamentos`,
      query: { mes: row.payment.referenceMonth },
    },
  });
  return out;
}

function menuItems(row: PaymentRow): MenuItem[] {
  const items: MenuItem[] = [];
  if (row.payment.receipt)
    items.push({ label: "ver comprovante", icon: "paperclip", onSelect: () => view(row.payment) });
  if (auth.isEmployer && isWritable(row.contract)) {
    items.push({
      label: row.payment.receipt ? "trocar comprovante" : "anexar comprovante",
      icon: "paperclip",
      onSelect: () => pickReceipt(row),
    });
    items.push({ label: "remover", icon: "trash", danger: true, onSelect: () => askRemove(row) });
  }
  return items;
}

const canRegister = computed(() => auth.isEmployer && contracts.value.some(isWritable));
const firstColspan = 3;
const restColspan = computed(() => (lg.value ? 3 : 2) + 1);
</script>

<template>
  <div class="pv">
    <PageHeader
      title="Pagamentos"
      :subtitle="
        auth.isEmployer
          ? 'Tudo o que você pagou, com comprovante e o “recebi” de cada pessoa.'
          : 'O que você recebeu. Toque em “recebi” para confirmar.'
      "
    >
      <template v-if="canRegister" #actions>
        <Button to="/pagamentos/novo" variant="primary" icon="wallet-plus"
          >registrar pagamento</Button
        >
      </template>
    </PageHeader>

    <div class="kpi-grid">
      <KpiCard
        tone="brand"
        icon="coins"
        :label="`${auth.isEmployer ? 'Pago' : 'Recebido'} em ${year}`"
        :value="formatCents(yearTotals.cents)"
        :amount="yearTotals.cents"
        :format="formatCents"
        :caption="yearTotals.count === 1 ? '1 pagamento' : `${yearTotals.count} pagamentos`"
        :loading="!payments.data.value"
      />
      <KpiCard
        tone="brand"
        icon="check"
        label="Com “recebi”"
        :value="String(yearTotals.acknowledged)"
        :caption="`de ${yearTotals.count}`"
        :loading="!payments.data.value"
      />
      <KpiCard
        :tone="yearTotals.count - yearTotals.acknowledged > 0 ? 'amber' : 'neutral'"
        icon="clock"
        :label="auth.isEmployer ? 'Aguardando “recebi”' : 'Falta confirmar'"
        :value="String(yearTotals.count - yearTotals.acknowledged)"
        :caption="auth.isEmployer ? 'a pessoa confirma pelo app' : 'toque em “recebi”'"
        :loading="!payments.data.value"
      />
    </div>

    <EmptyState
      v-if="payments.error.value"
      tone="error"
      title="Não deu para carregar os pagamentos."
    >
      {{ payments.error.value.message }}
      <template #actions><Button @click="payments.reload">tentar de novo</Button></template>
    </EmptyState>

    <DataTable
      v-else
      label="Pagamentos"
      :rows="rows"
      :columns="columns"
      :row-key="(r) => r.payment.id"
      :state="state"
      :filter="filter"
      :filters-active="filterCount > 0"
      :filter-count="filterCount"
      :loading="payments.loading.value"
      search-placeholder="Buscar por pessoa, mês ou forma"
      :count-label="(n) => (n === 1 ? '1 pagamento' : `${n} pagamentos`)"
      :empty-title="`Nenhum pagamento em ${year}.`"
      @clear-filters="onClear"
    >
      <template #filters>
        <Select
          :model-value="state.filters.ano ?? ''"
          @update:model-value="(v) => (state.filters.ano = v ?? '')"
          :options="yearOptions"
          label="Ano"
          class="pv__filter"
        />
        <Select
          v-if="contracts.length > 1"
          :model-value="state.filters.pessoa ?? ''"
          @update:model-value="(v) => (state.filters.pessoa = v ?? '')"
          :options="personOptions"
          :label="auth.isEmployer ? 'Pessoa' : 'Quem pagou'"
          class="pv__filter"
        />
        <Select
          :model-value="state.filters.forma ?? ''"
          @update:model-value="(v) => (state.filters.forma = v ?? '')"
          :options="methodOptions"
          label="Forma"
          class="pv__filter"
        />
        <Select
          :model-value="state.filters.recebido ?? ''"
          @update:model-value="(v) => (state.filters.recebido = v ?? '')"
          :options="receivedOptions"
          label="Recebido"
          class="pv__filter"
        />
      </template>

      <template #cell-pessoa="{ row }">
        <span class="pv__who">
          <Avatar :name="personOf(row.contract)" :size="32" />
          <span class="pv__who-text">
            <strong class="pv__nowrap">{{ personOf(row.contract) }}</strong>
            <span v-if="row.payment.note" class="pv__note">{{ row.payment.note }}</span>
          </span>
        </span>
      </template>
      <template #cell-ref="{ row }">
        <span class="pv__nowrap">{{ formatYearMonth(row.payment.referenceMonth) }}</span>
      </template>
      <template #cell-forma="{ row }">
        <span class="pv__method">
          <StatusChip tone="neutral" :dot="false">{{
            PAYMENT_METHOD_LABEL[row.payment.method]
          }}</StatusChip>
          <span v-if="row.agreement" class="pv__agreement">{{ row.agreement }}</span>
        </span>
      </template>
      <template #cell-comprovante="{ row }">
        <button
          v-if="row.payment.receipt"
          type="button"
          class="pv__receipt"
          :aria-label="`Ver comprovante de ${formatYearMonth(row.payment.referenceMonth)}`"
          @click="view(row.payment)"
        >
          anexado
        </button>
        <span v-else class="pv__dash" aria-label="sem comprovante">—</span>
      </template>
      <template #cell-recebido="{ row }">
        <StatusChip v-if="row.payment.acknowledgedAt" tone="brand">recebido</StatusChip>
        <StatusChip v-else tone="amber">aguardando</StatusChip>
      </template>

      <template #row-actions="{ row }">
        <TableActions v-if="wide" :actions="inlineActions(row)" :menu="menuItems(row)" />
      </template>

      <template #card="{ row }">
        <div class="pv__card">
          <p class="pv__card-who">
            <Avatar :name="personOf(row.contract)" :size="28" />
            <strong>{{ personOf(row.contract) }}</strong>
            <span v-if="row.agreement" class="pv__agreement">· {{ row.agreement }}</span>
          </p>
          <ReceiptStub
            :payment="row.payment"
            :can-acknowledge="auth.isWorker"
            :busy="busyId === row.payment.id"
            @acknowledge="acknowledge(row)"
            @view="view(row.payment)"
          />
        </div>
      </template>

      <template #footer="{ rows: shown }">
        <tr v-if="wide">
          <td :colspan="firstColspan" class="pv__foot-label">
            Total · {{ shown.length === 1 ? "1 pagamento" : `${shown.length} pagamentos` }}
          </td>
          <td class="pv__foot-sum mono">{{ formatCents(paymentTotals(shown).cents) }}</td>
          <td :colspan="restColspan" class="pv__foot-ack">
            {{ paymentTotals(shown).acknowledged }} de {{ shown.length }} com “recebi”
          </td>
        </tr>
        <p v-else class="pv__foot-card">
          <span class="label">Total</span>
          <span class="mono">{{ formatCents(paymentTotals(shown).cents) }}</span>
        </p>
      </template>

      <template #empty>
        <EmptyState :title="`Nenhum pagamento em ${year}.`">
          <template v-if="auth.isEmployer"
            >Registre cada pagamento com o comprovante. Fica guardado para os dois lados.</template
          >
          <template v-else
            >Quando houver um pagamento, ele aparece aqui para você confirmar que recebeu.</template
          >
          <template v-if="canRegister" #actions>
            <Button to="/pagamentos/novo" variant="primary" icon="wallet-plus"
              >registrar pagamento</Button
            >
          </template>
        </EmptyState>
      </template>
    </DataTable>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      tabindex="-1"
      aria-hidden="true"
      :accept="RECEIPT_MIME_TYPES.join(',')"
      @change="onFile"
    />
    <ReceiptViewer v-model:open="viewerOpen" :payment="viewing" />
    <ConfirmDialog
      v-model:open="removeOpen"
      title="Remover pagamento?"
      :message="
        removing
          ? `O pagamento de ${formatCents(removing.payment.amountCents)} para ${removing.contract.workerName} e o comprovante saem do histórico.`
          : undefined
      "
      confirm-label="remover"
      :loading="!!removing && busyId === removing.payment.id"
      @confirm="confirmRemove"
    />
  </div>
</template>

<style scoped>
.pv {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.pv__filter {
  min-width: 168px;
}

.pv__who {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.pv__who-text {
  display: grid;
  min-width: 0;
}

.pv__note {
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--t-12);
  color: var(--ink-2);
}

.pv__method {
  display: grid;
  justify-items: start;
  gap: 2px;
}

.pv__agreement {
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--t-12);
  color: var(--ink-2);
}

.pv__receipt {
  min-height: 32px;
  padding: 0 var(--s-2);
  border-radius: var(--r-1);
  font-size: var(--t-14);
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--rule);
  text-underline-offset: 3px;
}

.pv__receipt:hover {
  background: var(--surface-2);
  text-decoration-color: currentColor;
}

.pv__nowrap {
  white-space: nowrap;
}

.pv__dash {
  font-size: var(--t-12);
  color: var(--ink-3);
}

.pv__card {
  display: grid;
  gap: var(--s-2);
}

.pv__card-who {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
}

/* The stub is its own card; the DataTable card around it steps back. */
:deep(.dt__card:has(.pv__card)) {
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
  grid-template-columns: minmax(0, 1fr);
}

:deep(.dt__card:has(.pv__card) .dt__card-actions:empty) {
  display: none;
}

.pv__foot-label {
  font-size: var(--t-12);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-2);
}

.pv__foot-sum {
  text-align: right;
  font-size: var(--t-16);
}

.pv__foot-ack {
  font-weight: 400 !important;
  font-size: var(--t-12);
  color: var(--ink-2);
}

.pv__foot-card {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: var(--s-3) var(--s-1) 0;
  border-top: 3px double var(--ink);
}

.pv__foot-card .mono {
  font-size: var(--t-20);
  font-weight: 600;
}
</style>
