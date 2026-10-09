<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  formatCents,
  formatYearMonth,
  handsMoney,
  nowInZone,
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  RECEIPT_MIME_TYPES,
  type Payment,
} from "@emdia/shared";
import { computed, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import { errorMessage, paymentsApi } from "@/api";
import PaymentBulkEditSheet from "@/components/feature/PaymentBulkEditSheet.vue";
import PaymentEditSheet from "@/components/feature/PaymentEditSheet.vue";
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
import Tooltip from "@/components/ui/Tooltip.vue";
import type { InlineAction, MenuItem } from "@/components/ui/menu.ts";
import { usePaymentBulk } from "@/composables/paymentBulk.ts";
import { useInvalidate } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { useTeamPayments } from "@/composables/teamPayments.ts";
import { countOf } from "@/lib/bulk.ts";
import { isWritable } from "@/lib/contract.ts";
import { formatDateShort } from "@/lib/format.ts";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import {
  advanceProgress,
  awaitsReceipt,
  canDeletePayment,
  formatSigned,
  type BulkPaymentChanges,
  KIND_OPTIONS,
  kindNoun,
  kindTone,
  matchesPaymentFilters,
  paymentTotals,
  paymentYears,
  receivedStatus,
  signedCents,
  type PaymentRow,
} from "@/lib/payments.ts";
import AdvancesPanel from "@/components/feature/AdvancesPanel.vue";
import { receiptProblem } from "@/lib/receipt.ts";
import { spansAround, type Column } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const wide = useMediaQuery(MQ.md);

const thisYear = Number(nowInZone(DEFAULT_TIMEZONE).date.slice(0, 4));
const { state, clear } = useTableState({
  defaultSort: { key: "pago", dir: "desc" },
  filters: ["pessoa", "ano", "tipo", "forma", "recebido"],
});

const year = computed(() => {
  const n = Number(state.filters.ano);
  return Number.isInteger(n) && n >= 2000 && n <= thisYear ? n : thisYear;
});
const payments = useTeamPayments(() => year.value);
const invalidate = useInvalidate();

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
const kindOptions = [{ value: "", label: "Todos os tipos" }, ...KIND_OPTIONS];
const openAdvances = computed(() =>
  (payments.data.value?.advances ?? []).map((a) => ({
    payment: a.payment,
    who: contracts.value.length > 1 ? personOf(a.contract) : undefined,
  })),
);

function methodText(r: PaymentRow): string {
  const label = r.payment.method ? PAYMENT_METHOD_LABEL[r.payment.method] : "—";
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
    priority: 2,
  },
  {
    key: "tipo",
    label: "Tipo",
    value: (r) => PAYMENT_KIND_LABEL[r.payment.kind],
    sortable: true,
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
    priority: 1,
  },
  {
    key: "valor",
    label: "Valor",
    value: (r) => signedCents(r.payment),
    format: (r) => formatSigned(r.payment),
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
    tipo: state.filters.tipo,
    forma: state.filters.forma,
    recebido: state.filters.recebido,
  });
const filterCount = computed(
  () =>
    [
      state.filters.pessoa,
      state.filters.tipo,
      state.filters.forma,
      state.filters.recebido,
      state.filters.ano,
    ].filter(Boolean).length,
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
    advances: prev?.advances ?? [],
    rows: (prev?.rows ?? []).map((r) =>
      r.payment.id === updated.id ? { ...r, payment: updated } : r,
    ),
  }));
  void invalidate.records(updated.contractId, payments);
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
  if (file && row) void uploadReceipt(row, file);
}
function uploadReceipt(row: PaymentRow, file: File): Promise<void> {
  const problem = receiptProblem(file);
  if (problem) {
    toast.error(problem);
    return Promise.resolve();
  }
  const form = new FormData();
  form.append("receipt", file);
  return run(row, async () => {
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
      advances: prev?.advances ?? [],
      rows: (prev?.rows ?? []).filter((r) => r.payment.id !== row.payment.id),
    }));
    void invalidate.records(row.contract.id, payments);
    toast.success(
      row.payment.advanceId
        ? "Abatimento removido. O adiantamento voltou a ter esse valor."
        : "Removido.",
    );
  });
  removeOpen.value = false;
}

function canManage(row: PaymentRow): boolean {
  return auth.isEmployer && isWritable(row.contract);
}

function confirm(row: PaymentRow): Promise<void> {
  return run(row, async () => {
    replace((await paymentsApi.confirm(row.contract.id, row.payment.id)).payment);
    toast.success("Pagamento concluído.");
  });
}

const editOpen = ref(false);
const editing = ref<PaymentRow | null>(null);
function edit(row: PaymentRow): void {
  editing.value = row;
  editOpen.value = true;
}
function onSaved(p: Payment): void {
  replace(p);
  toast.success("Pagamento atualizado.");
}

async function replaceViewed(file: File): Promise<void> {
  const p = viewing.value;
  const row = rows.value.find((r) => r.payment.id === p?.id);
  if (!row) return;
  await uploadReceipt(row, file);
  viewing.value = rows.value.find((r) => r.payment.id === row.payment.id)?.payment ?? p;
}

function inlineActions(row: PaymentRow): InlineAction[] {
  const out: InlineAction[] = [];
  if (!handsMoney(row.payment)) return out;
  if (auth.isWorker && !row.payment.acknowledgedAt)
    out.push({
      label: "Recebi",
      icon: "check",
      tone: "brand",
      loading: busyId.value === row.payment.id,
      onClick: () => void acknowledge(row),
    });
  // One receipt icon: the viewer (where it can be swapped) or, with none yet, the upload.
  if (row.payment.receipt)
    out.push({
      label: `Ver comprovante de ${formatYearMonth(row.payment.referenceMonth)}`,
      icon: "receipt",
      tone: "brand",
      onClick: () => view(row.payment),
    });
  else if (canManage(row))
    out.push({
      label: `Anexar comprovante de ${formatYearMonth(row.payment.referenceMonth)}`,
      icon: "receipt",
      loading: busyId.value === row.payment.id,
      onClick: () => pickReceipt(row),
    });
  return out;
}

function menuItems(row: PaymentRow): MenuItem[] {
  const items: MenuItem[] = [
    {
      label: "Ver pagamentos da pessoa",
      icon: "eye",
      onSelect: () =>
        void router.push({
          path: `/equipe/${row.contract.id}/pagamentos`,
          query: { mes: row.payment.referenceMonth },
        }),
    },
  ];
  if (canManage(row)) {
    items.push({ label: "Editar", icon: "pencil", onSelect: () => edit(row) });
    if (!row.payment.acknowledgedAt && handsMoney(row.payment))
      items.push({
        label: "Marcar como concluído",
        icon: "check",
        onSelect: () => void confirm(row),
      });
    items.push({ label: "Remover", icon: "trash", danger: true, onSelect: () => askRemove(row) });
  }
  return items;
}

const canRegister = computed(() => auth.isEmployer && contracts.value.some(isWritable));

/** The employer acts on many payments at once; the worker only says "recebi" to many. */
const selectable = computed(() => contracts.value.some(isWritable));
const selected = ref<string[]>([]);
const writableContracts = computed(
  () => new Set(contracts.value.filter(isWritable).map((c) => c.id)),
);
const bulk = usePaymentBulk({
  updated: (list) => {
    const byId = new Map(list.map((p) => [p.id, p]));
    payments.mutate((prev) => ({
      contracts: prev?.contracts ?? [],
      advances: prev?.advances ?? [],
      rows: (prev?.rows ?? []).map((r) => {
        const p = byId.get(r.payment.id);
        return p ? { ...r, payment: p } : r;
      }),
    }));
  },
  removed: (ids) =>
    payments.mutate((prev) => ({
      contracts: prev?.contracts ?? [],
      advances: prev?.advances ?? [],
      rows: (prev?.rows ?? []).filter((r) => !ids.has(r.payment.id)),
    })),
  canWrite: (p) => writableContracts.value.has(p.contractId),
  fresh: () => [payments],
});

function selectLabel(row: PaymentRow): string {
  return `Selecionar ${kindNoun(row.payment)} de ${personOf(row.contract)}, ${formatDateShort(row.payment.paidOn)}`;
}

const paymentsOf = (picked: readonly PaymentRow[]) => picked.map((r) => r.payment);

/** Rows that failed stay selected, so trying again is one click. */
function keepFailed(outcome: { failed: { item: Payment }[] } | null): void {
  if (outcome) selected.value = outcome.failed.map((f) => f.item.id);
}

const bulkTargets = ref<Payment[]>([]);
const bulkKept = computed(() => bulkTargets.value.filter((p) => !canDeletePayment(p)).length);
const bulkRemoveOpen = ref(false);
function askBulkRemove(picked: readonly PaymentRow[]): void {
  bulkTargets.value = paymentsOf(picked);
  bulkRemoveOpen.value = true;
}
async function confirmBulkRemove(): Promise<void> {
  keepFailed(await bulk.remove(bulkTargets.value));
  bulkRemoveOpen.value = false;
}

const bulkEditOpen = ref(false);
function openBulkEdit(picked: readonly PaymentRow[]): void {
  bulkTargets.value = paymentsOf(picked);
  bulkEditOpen.value = true;
}
async function saveBulkEdit(changes: BulkPaymentChanges): Promise<void> {
  const outcome = await bulk.edit(bulkTargets.value, changes);
  keepFailed(outcome);
  if (outcome) bulkEditOpen.value = false;
}
const footerSpans = (shown: readonly Column<PaymentRow>[]) => spansAround(shown, "valor");
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
        <Button
          to="/pagamentos/novo"
          variant="primary"
          icon="wallet-plus"
          icon-only
          label="Registrar pagamento"
        />
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
        :caption="yearTotals.count === 1 ? '1 lançamento' : `${yearTotals.count} lançamentos`"
        :loading="!payments.data.value"
      />
      <KpiCard
        tone="brand"
        icon="check"
        label="Com “recebi”"
        :value="String(yearTotals.acknowledged)"
        :caption="`de ${yearTotals.money}`"
        :loading="!payments.data.value"
      />
      <KpiCard
        :tone="yearTotals.money - yearTotals.acknowledged > 0 ? 'amber' : 'neutral'"
        icon="clock"
        :label="auth.isEmployer ? 'Aguardando “recebi”' : 'Falta confirmar'"
        :value="String(yearTotals.money - yearTotals.acknowledged)"
        :caption="auth.isEmployer ? 'a pessoa confirma pelo app' : 'toque em “recebi”'"
        :loading="!payments.data.value"
      />
    </div>

    <AdvancesPanel :items="openAdvances" :employer="auth.isEmployer" />

    <EmptyState
      v-if="payments.error.value"
      tone="error"
      title="Não deu para carregar os pagamentos."
    >
      {{ payments.error.value.message }}
      <template #actions
        ><Button icon="refresh" @click="payments.reload">Tentar de novo</Button></template
      >
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
      search-placeholder="Buscar por pessoa, mês, tipo ou forma"
      :count-label="(n) => (n === 1 ? '1 lançamento' : `${n} lançamentos`)"
      :empty-title="`Nenhum pagamento em ${year}.`"
      v-model:selected="selected"
      :selectable="selectable"
      :select-label="selectLabel"
      @clear-filters="onClear"
    >
      <template v-if="selectable" #bulk-actions="{ rows: picked }">
        <template v-if="auth.isEmployer">
          <Button
            icon="check"
            :loading="bulk.busy.value === 'confirm'"
            :disabled="!!bulk.busy.value || !picked.some((r) => awaitsReceipt(r.payment))"
            @click="bulk.confirm(paymentsOf(picked)).then(keepFailed)"
            >Marcar como concluído</Button
          >
          <Button icon="pencil" :disabled="!!bulk.busy.value" @click="openBulkEdit(picked)"
            >Editar</Button
          >
          <Button
            icon="trash"
            variant="danger"
            :disabled="!!bulk.busy.value || !picked.some((r) => canDeletePayment(r.payment))"
            @click="askBulkRemove(picked)"
            >Excluir</Button
          >
        </template>
        <Button
          v-else
          variant="primary"
          icon="check"
          :loading="bulk.busy.value === 'acknowledge'"
          :disabled="!picked.some((r) => awaitsReceipt(r.payment))"
          @click="bulk.acknowledge(paymentsOf(picked)).then(keepFailed)"
          >Recebi</Button
        >
      </template>

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
          :model-value="state.filters.tipo ?? ''"
          @update:model-value="(v) => (state.filters.tipo = v ?? '')"
          :options="kindOptions"
          label="Tipo"
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
            <Tooltip v-if="row.payment.note" :text="row.payment.note"
              ><span class="pv__note">{{ row.payment.note }}</span></Tooltip
            >
          </span>
        </span>
      </template>
      <template #cell-ref="{ row }">
        <span class="pv__nowrap">{{ formatYearMonth(row.payment.referenceMonth) }}</span>
      </template>
      <template #cell-tipo="{ row }">
        <span class="pv__method">
          <StatusChip :tone="kindTone(row.payment.kind)" :dot="false">{{
            PAYMENT_KIND_LABEL[row.payment.kind]
          }}</StatusChip>
          <span v-if="row.payment.kind === 'advance'" class="pv__agreement pv__left">{{
            advanceProgress(row.payment)
          }}</span>
        </span>
      </template>
      <template #cell-valor="{ row }">
        <span :class="{ 'is-minus': row.payment.kind === 'deduction' }">{{
          formatSigned(row.payment)
        }}</span>
      </template>
      <template #cell-forma="{ row }">
        <span class="pv__method">
          <span v-if="!row.payment.method" class="pv__none">—</span>
          <StatusChip v-else tone="neutral" :dot="false">{{
            PAYMENT_METHOD_LABEL[row.payment.method]
          }}</StatusChip>
          <span v-if="row.agreement" class="pv__agreement">{{ row.agreement }}</span>
        </span>
      </template>
      <template #cell-recebido="{ row }">
        <span v-if="!handsMoney(row.payment)" class="pv__none">Não se aplica</span>
        <StatusChip v-else :tone="receivedStatus(row.payment).tone">{{
          receivedStatus(row.payment).label
        }}</StatusChip>
      </template>

      <template #row-actions="{ row }">
        <TableActions v-if="wide" :actions="inlineActions(row)" :menu="menuItems(row)" />
      </template>

      <template #card="{ row }">
        <div class="pv__card">
          <p class="pv__card-who">
            <Avatar :name="personOf(row.contract)" :size="28" />
            <strong>{{ personOf(row.contract) }}</strong>
          </p>
          <ReceiptStub
            :payment="row.payment"
            :agreement="row.payment.agreementId ? row.agreement : null"
            :advance="row.payment.advanceId ? row.agreement : null"
            :can-acknowledge="auth.isWorker"
            :can-manage="canManage(row)"
            :busy="busyId === row.payment.id"
            @acknowledge="acknowledge(row)"
            @confirm="confirm(row)"
            @edit="edit(row)"
            @remove="askRemove(row)"
            @attach="uploadReceipt(row, $event)"
            @view="view(row.payment)"
          />
        </div>
      </template>

      <template #footer="{ rows: shown, columns: visible }">
        <tr v-if="wide">
          <td :colspan="footerSpans(visible)[0]" class="pv__foot-label">
            Total pago · {{ shown.length === 1 ? "1 lançamento" : `${shown.length} lançamentos` }}
          </td>
          <td class="pv__foot-sum mono">{{ formatCents(paymentTotals(shown).cents) }}</td>
          <td :colspan="footerSpans(visible)[1]" class="pv__foot-ack">
            {{ paymentTotals(shown).acknowledged }} de {{ paymentTotals(shown).money }} com “recebi”
          </td>
        </tr>
        <p v-else class="pv__foot-card">
          <span class="label">Total pago</span>
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
              >Registrar pagamento</Button
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
    <ReceiptViewer
      v-model:open="viewerOpen"
      :payment="viewing"
      :can-replace="
        auth.isEmployer && rows.some((r) => r.payment.id === viewing?.id && canManage(r))
      "
      :replacing="!!viewing && busyId === viewing.id"
      @replace="replaceViewed"
    />
    <PaymentEditSheet
      v-if="auth.isEmployer"
      v-model:open="editOpen"
      :payment="editing?.payment ?? null"
      :subtitle="editing ? personOf(editing.contract) : undefined"
      @saved="onSaved"
    />
    <ConfirmDialog
      v-model:open="removeOpen"
      :title="removing ? `Remover ${kindNoun(removing.payment)}?` : 'Remover?'"
      :message="
        removing
          ? `O lançamento de ${formatCents(removing.payment.amountCents)} para ${removing.contract.workerName}${removing.payment.receipt ? ' e o comprovante saem' : ' sai'} do histórico.`
          : undefined
      "
      confirm-label="Remover"
      :loading="!!removing && busyId === removing.payment.id"
      @confirm="confirmRemove"
    />
    <PaymentBulkEditSheet
      v-if="auth.isEmployer"
      v-model:open="bulkEditOpen"
      :payments="bulkTargets"
      :busy="bulk.busy.value === 'edit'"
      @submit="saveBulkEdit"
    />
    <ConfirmDialog
      v-model:open="bulkRemoveOpen"
      :title="`Excluir ${countOf(bulkTargets.length, 'lançamento')}?`"
      :message="`${
        bulkTargets.length - bulkKept === 1
          ? 'O lançamento sai do histórico, com o comprovante.'
          : 'Os lançamentos saem do histórico, com os comprovantes.'
      }${
        bulkKept > 0
          ? ` ${countOf(bulkKept, 'adiantamento')} com dias abatidos ${bulkKept === 1 ? 'fica' : 'ficam'}.`
          : ''
      }`"
      :confirm-label="`Excluir ${countOf(bulkTargets.length - bulkKept, 'lançamento')}`"
      :loading="bulk.busy.value === 'remove'"
      @confirm="confirmBulkRemove"
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
  max-width: 20ch;
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
  display: block;
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--t-12);
  color: var(--ink-2);
}

.pv__left {
  max-width: 18ch;
  white-space: normal;
  color: var(--amber-ink);
}

.pv__none {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.is-minus {
  color: var(--coral-ink);
}

.pv__nowrap {
  white-space: nowrap;
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

:deep(.dt__card.is-selectable:has(.pv__card)) {
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--s-1);
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
