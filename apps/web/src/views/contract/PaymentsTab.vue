<script setup lang="ts">
import {
  countsAsPaid,
  formatCents,
  formatYearMonth,
  handsMoney,
  isOpenAdvance,
  parseYearMonth,
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  RECEIPT_MIME_TYPES,
  type Payment,
} from "@emdia/shared";
import { computed, ref, useTemplateRef } from "vue";
import { agreementsApi, errorMessage, paymentsApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import PaymentEditSheet from "@/components/feature/PaymentEditSheet.vue";
import ReceiptStub from "@/components/feature/ReceiptStub.vue";
import ReceiptViewer from "@/components/feature/ReceiptViewer.vue";
import Button from "@/components/ui/Button.vue";
import DataTable from "@/components/ui/DataTable.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import type { InlineAction, MenuItem } from "@/components/ui/menu.ts";
import Select from "@/components/ui/Select.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import TableActions from "@/components/ui/TableActions.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useInvalidate, useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { isWritable } from "@/lib/contract.ts";
import { formatDateShort } from "@/lib/format.ts";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import {
  abatementLabel,
  advanceProgress,
  formatSigned,
  KIND_OPTIONS,
  kindNoun,
  kindTone,
  matchesPaymentFields,
  receivedStatus,
  signedCents,
} from "@/lib/payments.ts";
import AdvancesPanel from "@/components/feature/AdvancesPanel.vue";
import { receiptProblem } from "@/lib/receipt.ts";
import { spansAround, type Column } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const { contract, month, currentMonth } = useContract();
const wide = useMediaQuery(MQ.md);

const { state, active, clear } = useTableState({
  defaultSort: { key: "pago", dir: "desc" },
  filters: ["ano", "tipo", "recebido"],
  prefix: "pg_",
});

const thisYear = parseYearMonth(currentMonth).year;
const firstYear = computed(() => Number(contract.value.startedOn.slice(0, 4)));
const lastYear = computed(() =>
  contract.value.endedOn ? Number(contract.value.endedOn.slice(0, 4)) : thisYear,
);
const years = computed(() => {
  const list: number[] = [];
  for (let y = lastYear.value; y >= firstYear.value; y--) list.push(y);
  return list;
});
const fallbackYear = parseYearMonth(month.value).year;
const year = computed(() => {
  const y = Number(state.filters.ano);
  return Number.isInteger(y) && y >= 2000 ? y : fallbackYear;
});
const yearModel = computed({
  get: () => String(year.value),
  set: (v: string) => (state.filters.ano = v === String(fallbackYear) ? "" : v),
});

const yearOptions = computed(() =>
  years.value.map((y) => ({ value: String(y), label: String(y) })),
);
const RECEIVED_OPTIONS = [
  { value: "", label: "Recebido ou não" },
  { value: "sim", label: "Recebidos" },
  { value: "nao", label: "Aguardando “recebi”" },
];
const recebido = computed({
  get: () => state.filters.recebido ?? "",
  set: (v: string) => (state.filters.recebido = v),
});
const KIND_FILTER = [{ value: "", label: "Todos os tipos" }, ...KIND_OPTIONS];
const tipo = computed({
  get: () => state.filters.tipo ?? "",
  set: (v: string) => (state.filters.tipo = v),
});
const filterCount = computed(() => (state.filters.recebido ? 1 : 0) + (state.filters.tipo ? 1 : 0));

const payments = useResource(
  () => ({ id: contract.value.id, year: year.value }),
  queryKeys.payments,
  (s) => paymentsApi.list(s.id, s.year).then((r) => r.payments),
);
/** All adiantamentos, whatever their year: abatements name them and open ones are listed. */
const advances = useResource(
  () => contract.value.id,
  queryKeys.advances,
  (id) => paymentsApi.advances(id).then((r) => r.advances),
);
const openAdvances = computed(() =>
  (advances.data.value ?? []).filter(isOpenAdvance).map((payment) => ({ payment })),
);
const invalidate = useInvalidate();

const canManage = computed(() => auth.isEmployer && isWritable(contract.value));

function advanceName(p: Payment): string | null {
  return abatementLabel(p, advances.data.value ?? []);
}

function methodText(p: Payment): string {
  return p.method ? PAYMENT_METHOD_LABEL[p.method] : "—";
}

const columns: Column<Payment>[] = [
  {
    key: "referencia",
    label: "Referência",
    value: (p) => p.referenceMonth,
    format: (p) => formatYearMonth(p.referenceMonth),
    search: (p) => formatYearMonth(p.referenceMonth),
    sortable: true,
    searchable: true,
  },
  {
    key: "tipo",
    label: "Tipo",
    value: (p) => PAYMENT_KIND_LABEL[p.kind],
    sortable: true,
    searchable: true,
  },
  {
    key: "pago",
    label: "Pago em",
    value: (p) => p.paidOn,
    format: (p) => formatDateShort(p.paidOn),
    sortable: true,
    sortFirst: "desc",
    mono: true,
    priority: 3,
  },
  {
    key: "valor",
    label: "Valor",
    value: (p) => signedCents(p),
    format: (p) => formatSigned(p),
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
  {
    key: "forma",
    label: "Forma",
    value: methodText,
    search: (p) => agreementName(p) ?? advanceName(p) ?? "",
    sortable: true,
    searchable: true,
    priority: 2,
  },
  {
    key: "nota",
    label: "Observação",
    value: (p) => p.note,
    searchable: true,
    truncate: true,
    width: "18ch",
    priority: 1,
  },
  {
    key: "recebido",
    label: "Recebido",
    value: (p) => !!p.acknowledgedAt,
    sortable: true,
  },
];

const footerSpans = (shown: readonly Column<Payment>[]) => spansAround(shown, "valor");

function filter(p: Payment): boolean {
  return matchesPaymentFields(p, state.filters);
}

/** Paid in the year: descontos are not money and adiantamentos count as their days are abated. */
const total = computed(
  () => payments.data.value?.reduce((s, p) => s + (countsAsPaid(p) ? p.amountCents : 0), 0) ?? 0,
);
const busyId = ref<string | null>(null);

function replace(updated: Payment): void {
  payments.mutate((list = []) => list.map((p) => (p.id === updated.id ? updated : p)));
  void invalidate.records(contract.value.id, payments);
}

async function acknowledge(p: Payment): Promise<void> {
  busyId.value = p.id;
  try {
    replace((await paymentsApi.acknowledge(contract.value.id, p.id)).payment);
    toast.success("Recebimento confirmado.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

const pendingRemove = ref<string | null>(null);
async function remove(p: Payment): Promise<void> {
  if (pendingRemove.value !== p.id) {
    pendingRemove.value = p.id;
    setTimeout(() => {
      if (pendingRemove.value === p.id) pendingRemove.value = null;
    }, 6000);
    toast.show(`Excluir ${kindNoun(p)} de ${formatCents(p.amountCents)}?`, {
      timeout: 6000,
      action: { label: "Excluir", run: () => void remove(p) },
    });
    return;
  }
  pendingRemove.value = null;
  busyId.value = p.id;
  try {
    await paymentsApi.remove(contract.value.id, p.id);
    payments.mutate((list = []) => list.filter((x) => x.id !== p.id));
    void invalidate.records(contract.value.id, payments);
    toast.success(
      p.advanceId ? "Abatimento excluído. O adiantamento voltou a ter esse valor." : "Excluído.",
    );
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

async function attach(p: Payment, file: File): Promise<void> {
  const problem = receiptProblem(file);
  if (problem) {
    toast.error(problem);
    return;
  }
  const form = new FormData();
  form.append("receipt", file);
  busyId.value = p.id;
  try {
    replace((await paymentsApi.replaceReceipt(contract.value.id, p.id, form)).payment);
    toast.success("Comprovante anexado.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

const picker = useTemplateRef<HTMLInputElement>("picker");
const attaching = ref<Payment | null>(null);
function pickFor(p: Payment): void {
  attaching.value = p;
  picker.value?.click();
}
function onPicked(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file && attaching.value) void attach(attaching.value, file);
  attaching.value = null;
}

async function confirm(p: Payment): Promise<void> {
  busyId.value = p.id;
  try {
    replace((await paymentsApi.confirm(contract.value.id, p.id)).payment);
    toast.success("Pagamento concluído.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

/** One receipt icon: opens the viewer (where it can be swapped) or, with none yet, the upload. */
function inlineFor(p: Payment): InlineAction[] {
  if (!handsMoney(p)) return [];
  if (p.receipt)
    return [
      {
        label: `Ver comprovante de ${formatYearMonth(p.referenceMonth)}`,
        icon: "receipt",
        tone: "brand",
        onClick: () => view(p),
      },
    ];
  if (!canManage.value) return [];
  return [
    {
      label: `Anexar comprovante de ${formatYearMonth(p.referenceMonth)}`,
      icon: "receipt",
      loading: busyId.value === p.id,
      onClick: () => pickFor(p),
    },
  ];
}

function menuFor(p: Payment): MenuItem[] {
  if (!canManage.value) return [];
  const items: MenuItem[] = [{ label: "Editar", icon: "pencil", onSelect: () => edit(p) }];
  if (!p.acknowledgedAt && handsMoney(p))
    items.push({ label: "Marcar como concluído", icon: "check", onSelect: () => void confirm(p) });
  items.push({
    label: `Remover ${kindNoun(p)}`,
    icon: "trash",
    danger: true,
    onSelect: () => void remove(p),
  });
  return items;
}

const editOpen = ref(false);
const editing = ref<Payment | null>(null);
function edit(p: Payment): void {
  editing.value = p;
  editOpen.value = true;
}
function onSaved(p: Payment): void {
  replace(p);
  toast.success("Pagamento atualizado.");
}

async function replaceViewed(file: File): Promise<void> {
  const p = viewing.value;
  if (!p) return;
  await attach(p, file);
  viewing.value = payments.data.value?.find((x) => x.id === p.id) ?? p;
}

const agreements = useResource(
  () => contract.value.id,
  queryKeys.agreements,
  (id) => agreementsApi.list(id).then((r) => r.agreements),
);
const agreementById = computed(
  () => new Map((agreements.data.value ?? []).map((a) => [a.id, a.description])),
);
/** Compensation payments say what they paid down. */
function agreementName(p: Payment): string | null {
  return p.agreementId ? (agreementById.value.get(p.agreementId) ?? null) : null;
}

const viewerOpen = ref(false);
const viewing = ref<Payment | null>(null);
function view(p: Payment): void {
  viewing.value = p;
  viewerOpen.value = true;
}

function onClear(): void {
  clear();
}
</script>

<template>
  <div class="pt">
    <AdvancesPanel :items="openAdvances" :employer="canManage" />

    <EmptyState
      v-if="payments.error.value && !payments.data.value"
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
      :rows="payments.data.value ?? []"
      :columns="columns"
      :row-key="(p) => p.id"
      :state="state"
      :default-sort="{ key: 'pago', dir: 'desc' }"
      :filter="filter"
      :filters-active="filterCount > 0"
      :filter-count="filterCount"
      :loading="payments.loading.value && !payments.data.value"
      label="Pagamentos"
      search-placeholder="Buscar mês, tipo, forma, observação"
      :count-label="(n) => (n === 1 ? '1 lançamento' : `${n} lançamentos`)"
      @clear-filters="onClear"
    >
      <template #filters>
        <Select v-model="yearModel" :options="yearOptions" label="Ano" class="pt__filter" />
        <Select v-model="tipo" :options="KIND_FILTER" label="Tipo" class="pt__filter" />
        <Select
          v-model="recebido"
          :options="RECEIVED_OPTIONS"
          label="Recebido"
          class="pt__filter"
        />
      </template>

      <template v-if="canManage" #actions>
        <Button
          :to="{ path: '/pagamentos/novo', query: { vinculo: contract.id, mes: month } }"
          variant="primary"
          icon="wallet-plus"
          >Registrar pagamento</Button
        >
      </template>

      <template #empty>
        <EmptyState :title="`Nenhum pagamento em ${year}.`">
          <template v-if="auth.isEmployer"
            >Registre cada pagamento com o comprovante. Fica guardado para os dois lados.</template
          >
          <template v-else
            >Quando houver um pagamento, ele aparece aqui para você confirmar que recebeu.</template
          >
        </EmptyState>
      </template>

      <template #cell-referencia="{ row }">
        <span class="pt__ref">{{ formatYearMonth(row.referenceMonth) }}</span>
      </template>

      <template #cell-tipo="{ row }">
        <StatusChip :tone="kindTone(row.kind)" :dot="false">{{
          PAYMENT_KIND_LABEL[row.kind]
        }}</StatusChip>
        <span v-if="row.kind === 'advance'" class="pt__agr pt__left">{{
          advanceProgress(row)
        }}</span>
      </template>

      <template #cell-valor="{ row }">
        <span :class="{ 'is-minus': row.kind === 'deduction' }">{{ formatSigned(row) }}</span>
      </template>

      <template #cell-forma="{ row }">
        <span class="pt__method">{{ methodText(row) }}</span>
        <span v-if="agreementName(row)" class="pt__agr">Acordo: {{ agreementName(row) }}</span>
        <span v-if="advanceName(row)" class="pt__agr">{{ advanceName(row) }}</span>
      </template>

      <template #cell-recebido="{ row }">
        <span v-if="!handsMoney(row)" class="pt__none">Não se aplica</span>
        <StatusChip v-else-if="row.acknowledgedAt" tone="brand">{{
          receivedStatus(row).label
        }}</StatusChip>
        <Button
          v-else-if="auth.isWorker"
          variant="primary"
          icon="check"
          :loading="busyId === row.id"
          @click="acknowledge(row)"
          >Recebi</Button
        >
        <StatusChip v-else tone="amber">aguardando</StatusChip>
      </template>

      <template v-if="wide" #row-actions="{ row }">
        <TableActions
          :actions="inlineFor(row)"
          :menu="menuFor(row)"
          :menu-label="`Mais ações: ${kindNoun(row)} de ${formatCents(row.amountCents)}`"
        />
      </template>

      <template #card="{ row }">
        <ReceiptStub
          :payment="row"
          :agreement="agreementName(row)"
          :advance="advanceName(row)"
          :can-acknowledge="auth.isWorker"
          :can-manage="canManage"
          :busy="busyId === row.id"
          @acknowledge="acknowledge(row)"
          @confirm="confirm(row)"
          @edit="edit(row)"
          @remove="remove(row)"
          @attach="attach(row, $event)"
          @view="view(row)"
        />
      </template>

      <template #footer="{ columns: shown }">
        <tr v-if="wide">
          <td :colspan="footerSpans(shown)[0]">
            total pago em <span class="mono">{{ year }}</span>
          </td>
          <td class="pt__tot mono">{{ formatCents(total) }}</td>
          <td :colspan="footerSpans(shown)[1]" />
        </tr>
        <p v-else class="pt__sum">
          <span class="label">total pago em {{ year }}</span>
          <span class="mono pt__total">{{ formatCents(total) }}</span>
        </p>
      </template>
    </DataTable>

    <input
      ref="picker"
      class="visually-hidden"
      type="file"
      tabindex="-1"
      aria-hidden="true"
      :accept="RECEIPT_MIME_TYPES.join(',')"
      @change="onPicked"
    />
    <ReceiptViewer
      v-model:open="viewerOpen"
      :payment="viewing"
      :can-replace="canManage"
      :replacing="!!viewing && busyId === viewing.id"
      @replace="replaceViewed"
    />
    <PaymentEditSheet
      v-if="canManage"
      v-model:open="editOpen"
      :payment="editing"
      :subtitle="contract.workerName"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.pt {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.pt__filter {
  min-width: 9rem;
}

.pt__method {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  white-space: nowrap;
}

.pt__agr {
  display: block;
  font-size: var(--t-12);
  color: var(--ink-2);
}

.pt__left {
  color: var(--amber-ink);
}

.pt__none {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.is-minus {
  color: var(--coral-ink);
}

.pt__tot {
  text-align: right;
  white-space: nowrap;
}

.pt__ref {
  font-weight: 600;
  white-space: nowrap;
}

.pt :deep(.dt__card) {
  display: block;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
}

.pt__sum {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.pt__total {
  font-size: var(--t-20);
  font-weight: 600;
}
</style>
