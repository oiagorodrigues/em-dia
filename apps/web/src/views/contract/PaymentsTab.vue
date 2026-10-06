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
import { errorMessage, paymentsApi } from "@/api";
import ReceiptStub from "@/components/feature/ReceiptStub.vue";
import ReceiptViewer from "@/components/feature/ReceiptViewer.vue";
import Button from "@/components/ui/Button.vue";
import DataTable from "@/components/ui/DataTable.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import IconButton from "@/components/ui/IconButton.vue";
import Menu from "@/components/ui/Menu.vue";
import type { MenuItem } from "@/components/ui/menu.ts";
import StatusChip from "@/components/ui/StatusChip.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { isWritable } from "@/lib/contract.ts";
import { formatDateShort } from "@/lib/format.ts";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import { receiptProblem } from "@/lib/receipt.ts";
import type { Column } from "@/lib/table.ts";
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

const payments = useResource(
  () => `${contract.value.id}|${year.value}`,
  () => paymentsApi.list(contract.value.id, year.value).then((r) => r.payments),
);

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
    sortable: true,
    searchable: true,
  },
  { key: "nota", label: "Observação", value: (p) => p.note, searchable: true, hideBelow: "xl" },
  { key: "comprovante", label: "Comprovante", value: (p) => !!p.receipt },
  {
    key: "recebido",
    label: "Recebido",
    value: (p) => !!p.acknowledgedAt,
    sortable: true,
  },
];
const xl = useMediaQuery(MQ.xl);
/** Columns after "valor" in the footer row: forma, [nota], comprovante, recebido, [ações]. */
const footerSpan = computed(() => (xl.value ? 4 : 3) + (canManage.value ? 1 : 0));

function filter(p: Payment): boolean {
  if (state.filters.recebido === "sim") return !!p.acknowledgedAt;
  if (state.filters.recebido === "nao") return !p.acknowledgedAt;
  return true;
}

const total = computed(() => payments.data.value?.reduce((s, p) => s + p.amountCents, 0) ?? 0);
const busyId = ref<string | null>(null);

function replace(updated: Payment): void {
  payments.mutate((list = []) => list.map((p) => (p.id === updated.id ? updated : p)));
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

function menuFor(p: Payment): MenuItem[] {
  return [
    {
      label: p.receipt ? "trocar comprovante" : "anexar comprovante",
      icon: "upload",
      onSelect: () => pickFor(p),
    },
    { label: "excluir pagamento", icon: "trash", danger: true, onSelect: () => void remove(p) },
  ];
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
      <template #actions><Button @click="payments.reload">tentar de novo</Button></template>
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
      :loading="payments.loading.value && !payments.data.value"
      label="Pagamentos"
      search-placeholder="Buscar mês, forma, observação"
      :count-label="(n) => (n === 1 ? '1 pagamento' : `${n} pagamentos`)"
      @clear-filters="onClear"
    >
      <template #filters>
        <label class="pt__select">
          <span class="visually-hidden">Ano</span>
          <select v-model="yearModel" class="input">
            <option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
          </select>
        </label>
        <label class="pt__select">
          <span class="visually-hidden">Recebido</span>
          <select v-model="state.filters.recebido" class="input">
            <option value="">recebido ou não</option>
            <option value="sim">recebidos</option>
            <option value="nao">aguardando “recebi”</option>
          </select>
        </label>
      </template>

      <template v-if="canManage" #actions>
        <Button
          :to="{ path: '/pagamentos/novo', query: { vinculo: contract.id, mes: month } }"
          variant="primary"
          icon="plus"
          >novo pagamento</Button
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

      <template #cell-nota="{ row }">
        <span class="pt__note">{{ row.note ?? "" }}</span>
      </template>

      <template #cell-comprovante="{ row }">
        <IconButton
          v-if="row.receipt"
          icon="receipt"
          :label="`Ver comprovante de ${formatYearMonth(row.referenceMonth)}`"
          @click="view(row)"
        />
        <span v-else class="pt__none">—</span>
      </template>

      <template #cell-recebido="{ row }">
        <StatusChip v-if="row.acknowledgedAt" tone="green">recebido</StatusChip>
        <Button
          v-else-if="auth.isWorker"
          variant="primary"
          icon="check"
          :loading="busyId === row.id"
          @click="acknowledge(row)"
          >recebi</Button
        >
        <StatusChip v-else tone="butter">aguardando</StatusChip>
      </template>

      <template v-if="canManage && wide" #row-actions="{ row }">
        <Menu
          :items="menuFor(row)"
          :label="`Mais ações do pagamento de ${formatCents(row.amountCents)}`"
        />
      </template>

      <template #card="{ row }">
        <ReceiptStub
          :payment="row"
          :can-acknowledge="auth.isWorker"
          :can-manage="canManage"
          :busy="busyId === row.id"
          @acknowledge="acknowledge(row)"
          @remove="remove(row)"
          @attach="attach(row, $event)"
          @view="view(row)"
        />
      </template>

      <template #footer>
        <tr v-if="wide">
          <td colspan="2">
            total pago em <span class="mono">{{ year }}</span>
          </td>
          <td class="pt__tot mono">{{ formatCents(total) }}</td>
          <td :colspan="footerSpan" />
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
    <ReceiptViewer v-model:open="viewerOpen" :payment="viewing" />
  </div>
</template>

<style scoped>
.pt {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.pt__select .input {
  color: var(--ink);
  min-height: 44px;
  width: auto;
  padding-right: var(--s-6);
}

.pt__tot {
  text-align: right;
  white-space: nowrap;
}

.pt__ref {
  font-weight: 600;
}

.pt__note {
  display: block;
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-2);
}

.pt__none {
  color: var(--ink-3);
  padding-left: var(--s-3);
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
