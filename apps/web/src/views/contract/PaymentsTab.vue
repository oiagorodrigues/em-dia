<script setup lang="ts">
import {
  formatCents,
  formatYearMonth,
  parseYearMonth,
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
import { receivedStatus } from "@/lib/payments.ts";
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
  filters: ["ano", "recebido"],
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

const payments = useResource(
  () => ({ id: contract.value.id, year: year.value }),
  queryKeys.payments,
  (s) => paymentsApi.list(s.id, s.year).then((r) => r.payments),
);
const invalidate = useInvalidate();

const canManage = computed(() => auth.isEmployer && isWritable(contract.value));

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
    value: (p) => p.amountCents,
    format: (p) => formatCents(p.amountCents),
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
  {
    key: "forma",
    label: "Forma",
    value: (p) => PAYMENT_METHOD_LABEL[p.method],
    search: (p) => agreementName(p) ?? "",
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
  if (state.filters.recebido === "sim") return !!p.acknowledgedAt;
  if (state.filters.recebido === "nao") return !p.acknowledgedAt;
  return true;
}

const total = computed(() => payments.data.value?.reduce((s, p) => s + p.amountCents, 0) ?? 0);
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
    toast.show(`Excluir o pagamento de ${formatCents(p.amountCents)}?`, {
      timeout: 6000,
      action: { label: "excluir", run: () => void remove(p) },
    });
    return;
  }
  pendingRemove.value = null;
  busyId.value = p.id;
  try {
    await paymentsApi.remove(contract.value.id, p.id);
    payments.mutate((list = []) => list.filter((x) => x.id !== p.id));
    void invalidate.records(contract.value.id, payments);
    toast.success("Pagamento excluído.");
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
  if (!p.acknowledgedAt)
    items.push({ label: "Marcar como concluído", icon: "check", onSelect: () => void confirm(p) });
  items.push({
    label: "Remover pagamento",
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
    <EmptyState
      v-if="payments.error.value && !payments.data.value"
      tone="error"
      title="Não deu para carregar os pagamentos."
    >
      {{ payments.error.value.message }}
      <template #actions><Button @click="payments.reload">Tentar de novo</Button></template>
    </EmptyState>

    <DataTable
      v-else
      :rows="payments.data.value ?? []"
      :columns="columns"
      :row-key="(p) => p.id"
      :state="state"
      :default-sort="{ key: 'pago', dir: 'desc' }"
      :filter="filter"
      :filters-active="!!state.filters.recebido"
      :filter-count="state.filters.recebido ? 1 : 0"
      :loading="payments.loading.value && !payments.data.value"
      label="Pagamentos"
      search-placeholder="Buscar mês, forma, observação"
      :count-label="(n) => (n === 1 ? '1 pagamento' : `${n} pagamentos`)"
      @clear-filters="onClear"
    >
      <template #filters>
        <Select v-model="yearModel" :options="yearOptions" label="Ano" class="pt__filter" />
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
          icon="plus"
          >Novo pagamento</Button
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

      <template #cell-forma="{ row }">
        <span class="pt__method"
          >{{ PAYMENT_METHOD_LABEL[row.method] }}
          <StatusChip v-if="row.isExtra" tone="brand" :dot="false">extra</StatusChip></span
        >
        <span v-if="agreementName(row)" class="pt__agr">acordo: {{ agreementName(row) }}</span>
      </template>

      <template #cell-recebido="{ row }">
        <StatusChip v-if="row.acknowledgedAt" tone="brand">{{
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
          :menu-label="`Mais ações do pagamento de ${formatCents(row.amountCents)}`"
        />
      </template>

      <template #card="{ row }">
        <ReceiptStub
          :payment="row"
          :agreement="agreementName(row)"
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
