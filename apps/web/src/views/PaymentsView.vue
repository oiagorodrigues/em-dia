<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  formatCents,
  formatYearMonth,
  nowInZone,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type Payment,
} from "@emdia/shared";
import { computed, ref } from "vue";
import { errorMessage, paymentsApi } from "@/api";
import ReceiptStub from "@/components/feature/ReceiptStub.vue";
import ReceiptViewer from "@/components/feature/ReceiptViewer.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import Avatar from "@/components/ui/Avatar.vue";
import Button from "@/components/ui/Button.vue";
import DataTable from "@/components/ui/DataTable.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Icon from "@/components/ui/Icon.vue";
import IconButton from "@/components/ui/IconButton.vue";
import KpiCard from "@/components/ui/KpiCard.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
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
import type { Column } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const wide = useMediaQuery(MQ.md);
const lg = useMediaQuery(MQ.lg);

const thisYear = Number(nowInZone(DEFAULT_TIMEZONE).date.slice(0, 4));
const { state, active, clear } = useTableState({
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
const years = computed(() => paymentYears(contracts.value, thisYear));
const rows = computed(() => payments.data.value?.rows ?? []);

function personOf(c: PaymentRow["contract"]): string {
  return auth.isEmployer ? c.workerName : c.employerName;
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
    value: (r) => PAYMENT_METHOD_LABEL[r.payment.method],
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
const filtersActive = computed(
  () => !!(state.filters.pessoa || state.filters.forma || state.filters.recebido),
);
const yearTotals = computed(() => paymentTotals(rows.value.filter(filter)));

function onClear(): void {
  const ano = state.filters.ano;
  clear();
  state.filters.ano = ano ?? "";
}

const busyId = ref<string | null>(null);
async function acknowledge(row: PaymentRow): Promise<void> {
  busyId.value = row.payment.id;
  try {
    const { payment } = await paymentsApi.acknowledge(row.contract.id, row.payment.id);
    replace(payment);
    toast.success("Recebimento confirmado.");
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

const viewerOpen = ref(false);
const viewing = ref<Payment | null>(null);
function view(p: Payment): void {
  viewing.value = p;
  viewerOpen.value = true;
}

const canRegister = computed(() => auth.isEmployer && contracts.value.some(isWritable));
const firstColspan = 3;
const restColspan = computed(() => (lg.value ? 3 : 2) + 1);
</script>

<template>
  <div class="pv">
    <PageHeader
      title="pagamentos"
      :subtitle="
        auth.isEmployer
          ? 'Tudo o que você pagou, com comprovante e o “recebi” de cada pessoa.'
          : 'O que você recebeu. Toque em “recebi” para confirmar.'
      "
    >
      <template v-if="canRegister" #actions>
        <Button to="/pagamentos/novo" variant="primary" icon="plus">registrar pagamento</Button>
      </template>
    </PageHeader>

    <div class="pv__sum">
      <KpiCard
        tint="sky"
        icon="coins"
        :label="`${auth.isEmployer ? 'pago' : 'recebido'} em ${year}`"
        :value="formatCents(yearTotals.cents)"
        :caption="yearTotals.count === 1 ? '1 pagamento' : `${yearTotals.count} pagamentos`"
        :loading="!payments.data.value"
      />
      <KpiCard
        tint="mint"
        icon="check"
        label="com “recebi”"
        :value="String(yearTotals.acknowledged)"
        :caption="`de ${yearTotals.count}`"
        :loading="!payments.data.value"
      />
      <KpiCard
        tint="butter"
        icon="clock"
        :label="auth.isEmployer ? 'aguardando “recebi”' : 'falta confirmar'"
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
      :filters-active="filtersActive"
      :loading="payments.loading.value"
      search-placeholder="Buscar por pessoa, mês ou forma"
      :count-label="(n) => (n === 1 ? '1 pagamento' : `${n} pagamentos`)"
      :empty-title="`Nenhum pagamento em ${year}.`"
      @clear-filters="onClear"
    >
      <template #filters>
        <label class="pv__filter">
          <span class="visually-hidden">Ano</span>
          <select v-model="state.filters.ano" class="input" aria-label="Ano">
            <option value="">{{ thisYear }}</option>
            <option v-for="y in years.filter((y) => y !== thisYear)" :key="y" :value="String(y)">
              {{ y }}
            </option>
          </select>
        </label>
        <label v-if="contracts.length > 1" class="pv__filter">
          <span class="visually-hidden">{{ auth.isEmployer ? "Pessoa" : "Quem pagou" }}</span>
          <select
            v-model="state.filters.pessoa"
            class="input"
            :aria-label="auth.isEmployer ? 'Pessoa' : 'Quem pagou'"
          >
            <option value="">{{ auth.isEmployer ? "todas as pessoas" : "todas as casas" }}</option>
            <option v-for="c in contracts" :key="c.id" :value="c.id">{{ personOf(c) }}</option>
          </select>
        </label>
        <label class="pv__filter">
          <span class="visually-hidden">Forma</span>
          <select v-model="state.filters.forma" class="input" aria-label="Forma">
            <option value="">todas as formas</option>
            <option v-for="m in PAYMENT_METHODS" :key="m" :value="m">
              {{ PAYMENT_METHOD_LABEL[m] }}
            </option>
          </select>
        </label>
        <label class="pv__filter">
          <span class="visually-hidden">Recebido</span>
          <select v-model="state.filters.recebido" class="input" aria-label="Recebido">
            <option value="">recebido ou não</option>
            <option value="sim">recebido</option>
            <option value="nao">sem “recebi”</option>
          </select>
        </label>
      </template>

      <template #cell-pessoa="{ row }">
        <span class="pv__who">
          <Avatar :name="personOf(row.contract)" :size="32" />
          <span class="pv__who-text">
            <strong>{{ personOf(row.contract) }}</strong>
            <span v-if="row.payment.note" class="pv__note">{{ row.payment.note }}</span>
          </span>
        </span>
      </template>
      <template #cell-forma="{ row }">
        <StatusChip tone="neutral" :dot="false">{{
          PAYMENT_METHOD_LABEL[row.payment.method]
        }}</StatusChip>
      </template>
      <template #cell-comprovante="{ row }">
        <button
          v-if="row.payment.receipt"
          type="button"
          class="pv__receipt"
          :aria-label="`Ver comprovante de ${formatYearMonth(row.payment.referenceMonth)}`"
          @click="view(row.payment)"
        >
          <Icon
            :name="row.payment.receipt.mimeType === 'application/pdf' ? 'file' : 'image'"
            :size="16"
          />
          ver
        </button>
        <span v-else class="pv__dash">sem comprovante</span>
      </template>
      <template #cell-recebido="{ row }">
        <StatusChip v-if="row.payment.acknowledgedAt" tone="green">recebido</StatusChip>
        <StatusChip v-else tone="butter">aguardando</StatusChip>
      </template>

      <template #row-actions="{ row }">
        <Button
          v-if="wide && auth.isWorker && !row.payment.acknowledgedAt"
          variant="primary"
          icon="check"
          :loading="busyId === row.payment.id"
          @click="acknowledge(row)"
          >recebi</Button
        >
        <IconButton
          v-if="wide && auth.isEmployer"
          icon="arrow-right"
          :label="`Pagamentos de ${row.contract.workerName}`"
          :to="`/equipe/${row.contract.id}/pagamentos`"
        />
      </template>

      <template #card="{ row }">
        <div class="pv__card">
          <p class="pv__card-who">
            <Avatar :name="personOf(row.contract)" :size="28" />
            <strong>{{ personOf(row.contract) }}</strong>
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
            total · {{ shown.length === 1 ? "1 pagamento" : `${shown.length} pagamentos` }}
          </td>
          <td class="pv__foot-sum mono">{{ formatCents(paymentTotals(shown).cents) }}</td>
          <td :colspan="restColspan" class="pv__foot-ack">
            {{ paymentTotals(shown).acknowledged }} de {{ shown.length }} com “recebi”
          </td>
        </tr>
        <p v-else class="pv__foot-card">
          <span class="label">total</span>
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
            <Button to="/pagamentos/novo" variant="primary" icon="plus">registrar pagamento</Button>
          </template>
        </EmptyState>
      </template>
    </DataTable>

    <ReceiptViewer v-model:open="viewerOpen" :payment="viewing" />
  </div>
</template>

<style scoped>
.pv {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.pv__sum {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
}

.pv__filter .input {
  min-height: 44px;
  width: auto;
  font-size: var(--t-14);
  font-weight: 600;
  color: var(--ink);
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

.pv__receipt {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 36px;
  padding: 0 var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  font-size: var(--t-14);
  font-weight: 600;
  color: var(--blue);
}

.pv__receipt:hover {
  border-color: var(--blue);
  background: var(--blue-wash);
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

@media (max-width: 639px) {
  .pv__sum {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .pv__sum > :first-child {
    grid-column: span 2;
  }
}
</style>
