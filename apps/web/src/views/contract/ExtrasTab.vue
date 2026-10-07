<script setup lang="ts">
import {
  ADJUSTMENT_KIND_LABEL,
  ADJUSTMENT_KINDS,
  createAdjustmentSchema,
  formatCents,
  formatYearMonth,
  parseYearMonth,
  shiftMonth,
  toYearMonth,
  type AdjustmentKind,
} from "@emdia/shared";
import { computed, ref } from "vue";
import { adjustmentsApi, errorMessage, paymentsApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import Button from "@/components/ui/Button.vue";
import DataTable from "@/components/ui/DataTable.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Field from "@/components/ui/Field.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Select from "@/components/ui/Select.vue";
import Sheet from "@/components/ui/Sheet.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import TableActions from "@/components/ui/TableActions.vue";
import type { InlineAction } from "@/components/ui/menu.ts";
import { useContract } from "@/composables/contractContext.ts";
import { useForm } from "@/composables/form.ts";
import { useInvalidate, useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { isWritable } from "@/lib/contract.ts";
import { extraRows, extraSigned, type ExtraRow } from "@/lib/extras.ts";
import { formatRelative } from "@/lib/format.ts";
import type { Column } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const { contract, month, currentMonth, setMonth } = useContract();

const monthModel = computed({ get: () => month.value, set: setMonth });
const minMonth = computed(() => toYearMonth(contract.value.startedOn));
const maxMonth = computed(() =>
  contract.value.endedOn ? toYearMonth(contract.value.endedOn) : shiftMonth(currentMonth, 1),
);

const list = useResource(
  () => ({ id: contract.value.id, month: month.value }),
  queryKeys.adjustments,
  (s) => adjustmentsApi.list(s.id, s.month).then((r) => r.adjustments),
);
/** Payments flagged as extra count here too; the API lists payments by year. */
const payments = useResource(
  () => ({ id: contract.value.id, year: parseYearMonth(month.value).year }),
  queryKeys.payments,
  (s) => paymentsApi.list(s.id, s.year).then((r) => r.payments),
);
const invalidate = useInvalidate();

const rows = computed(() =>
  extraRows(list.data.value ?? [], payments.data.value ?? [], month.value),
);
const net = computed(() => rows.value.reduce((s, r) => s + extraSigned(r), 0));
const canWrite = computed(() => auth.isEmployer && isWritable(contract.value));

const { state, clear } = useTableState({
  defaultSort: { key: "lancado", dir: "desc" },
  filters: ["tipo"],
  prefix: "ex_",
});

function kindLabel(r: ExtraRow): string {
  return r.source === "payment" ? "Pagamento extra" : ADJUSTMENT_KIND_LABEL[r.adjustment.kind];
}

const columns: Column<ExtraRow>[] = [
  {
    key: "mes",
    label: "Mês",
    value: (r) => r.month,
    format: (r) => formatYearMonth(r.month),
    hideBelow: "lg",
  },
  { key: "tipo", label: "Tipo", value: kindLabel, sortable: true, searchable: true },
  {
    key: "descricao",
    label: "Descrição",
    value: (r) => r.description,
    searchable: true,
    truncate: true,
    width: "28ch",
    priority: 1,
  },
  {
    key: "lancado",
    label: "Lançado",
    value: (r) => r.createdAt,
    format: (r) => formatRelative(r.createdAt),
    sortable: true,
    sortFirst: "desc",
    mono: true,
    hideBelow: "xl",
  },
  {
    key: "valor",
    label: "Valor",
    value: extraSigned,
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
];

const KIND_FILTER = [
  { value: "", label: "Todos os tipos" },
  { value: "mais", label: "Somam (extras, vale-transporte)" },
  { value: "menos", label: "Descontam (vales, descontos)" },
];
const tipo = computed({
  get: () => state.filters.tipo ?? "",
  set: (v: string) => (state.filters.tipo = v),
});

function filter(r: ExtraRow): boolean {
  if (state.filters.tipo === "mais") return extraSigned(r) > 0;
  if (state.filters.tipo === "menos") return extraSigned(r) < 0;
  return true;
}

const kindOptions = ADJUSTMENT_KINDS.map((k) => ({ value: k, label: ADJUSTMENT_KIND_LABEL[k] }));
const formOpen = ref(false);
const { values, errors, formError, submitting, submit, clearError } = useForm(
  createAdjustmentSchema,
  {
    kind: "bonus" as AdjustmentKind,
    amountCents: null as number | null,
    description: "",
  },
);

function openForm(): void {
  values.kind = "bonus";
  values.amountCents = null;
  values.description = "";
  formError.value = null;
  clearError("amountCents");
  clearError("description");
  formOpen.value = true;
}

function onAdd(): void {
  const input = {
    month: month.value,
    kind: values.kind,
    amountCents: values.amountCents ?? 0,
    description: values.description.trim() || null,
  };
  void submit(async (data) => {
    const { adjustment } = await adjustmentsApi.create(contract.value.id, data);
    list.mutate((l = []) => [...l, adjustment]);
    void invalidate.records(contract.value.id, list);
    formOpen.value = false;
    toast.success(`${ADJUSTMENT_KIND_LABEL[adjustment.kind]} lançado.`);
  }, input);
}

const removing = ref<string | null>(null);
async function remove(id: string): Promise<void> {
  removing.value = id;
  try {
    await adjustmentsApi.remove(contract.value.id, id);
    list.mutate((l = []) => l.filter((x) => x.id !== id));
    void invalidate.records(contract.value.id, list);
    toast.success("Lançamento removido.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    removing.value = null;
  }
}

function actionsFor(r: ExtraRow): InlineAction[] {
  if (r.source === "payment")
    return [
      {
        label: `Ver pagamento extra de ${formatCents(r.payment.amountCents)} em Pagamentos`,
        icon: "wallet",
        to: {
          name: "contract-payments",
          params: { id: contract.value.id },
          query: { mes: r.month },
        },
      },
    ];
  if (!canWrite.value) return [];
  return [
    {
      label: `Remover ${ADJUSTMENT_KIND_LABEL[r.adjustment.kind]} de ${formatCents(r.adjustment.amountCents)}`,
      icon: "trash",
      tone: "coral",
      loading: removing.value === r.adjustment.id,
      onClick: () => void remove(r.adjustment.id),
    },
  ];
}

const extraPaymentLink = computed(() => ({
  path: "/pagamentos/novo",
  query: { vinculo: contract.value.id, mes: month.value, extra: "1" },
}));
</script>

<template>
  <div class="ex">
    <MonthSwitcher v-model="monthModel" :min="minMonth" :max="maxMonth" prefix="extras de" />

    <EmptyState
      v-if="list.error.value && !list.data.value"
      tone="error"
      title="Não deu para carregar os extras."
    >
      {{ list.error.value.message }}
      <template #actions
        ><Button icon="refresh" @click="list.reload">Tentar de novo</Button></template
      >
    </EmptyState>

    <DataTable
      v-else
      :rows="rows"
      :columns="columns"
      :row-key="(r) => r.id"
      :state="state"
      :default-sort="{ key: 'lancado', dir: 'desc' }"
      :filter="filter"
      :filters-active="!!state.filters.tipo"
      :filter-count="state.filters.tipo ? 1 : 0"
      :loading="list.loading.value && !list.data.value"
      label="Lançamentos do mês"
      search-placeholder="Buscar tipo ou descrição"
      :count-label="(n) => (n === 1 ? '1 lançamento' : `${n} lançamentos`)"
      @clear-filters="clear"
    >
      <template #filters>
        <Select v-model="tipo" :options="KIND_FILTER" label="Tipo" class="ex__filter" />
      </template>

      <template v-if="canWrite" #actions>
        <Button variant="primary" icon="plus" @click="openForm">Novo lançamento</Button>
      </template>

      <template #empty>
        <EmptyState title="Nada lançado neste mês.">
          Extras, vale-transporte, adiantamentos, descontos e pagamentos extras entram aqui e mudam
          o valor do mês.
        </EmptyState>
      </template>

      <template #cell-tipo="{ row }">
        <StatusChip :tone="extraSigned(row) < 0 ? 'coral' : 'brand'">{{
          kindLabel(row)
        }}</StatusChip>
      </template>

      <template #cell-valor="{ row }">
        <span :class="extraSigned(row) < 0 ? 'is-minus' : 'is-plus'"
          >{{ extraSigned(row) < 0 ? "−" : "+" }}
          {{ formatCents(Math.abs(extraSigned(row))) }}</span
        >
        <span v-if="row.source === 'payment'" class="ex__paid">Já pago</span>
      </template>

      <template #card="{ row }">
        <div class="ex__what">
          <p class="ex__kind">{{ kindLabel(row) }}</p>
          <p v-if="row.description" class="ex__desc">{{ row.description }}</p>
          <p class="ex__when">
            {{ formatRelative(row.createdAt) }}
            <template v-if="row.source === 'payment'"> · já pago</template>
          </p>
        </div>
        <p class="ex__amt mono" :class="extraSigned(row) < 0 ? 'is-minus' : 'is-plus'">
          {{ extraSigned(row) < 0 ? "−" : "+" }} {{ formatCents(Math.abs(extraSigned(row))) }}
        </p>
      </template>

      <template #row-actions="{ row }">
        <TableActions :actions="actionsFor(row)" />
      </template>
    </DataTable>

    <p v-if="rows.length > 0" class="ex__net">
      <span>Saldo dos lançamentos</span>
      <span class="mono" :class="{ 'is-minus': net < 0 }"
        >{{ net < 0 ? "−" : "+" }} {{ formatCents(Math.abs(net)) }}</span
      >
    </p>

    <p v-if="auth.isWorker" class="ex__ro">
      Só quem contrata lança extras e descontos. Você vê tudo aqui.
    </p>

    <Sheet
      v-model:open="formOpen"
      title="Novo lançamento"
      :subtitle="`${contract.workerName} · ${formatYearMonth(month)}`"
    >
      <form id="adjustment-form" class="stack" novalidate @submit.prevent="onAdd">
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <fieldset class="ex__set">
          <legend class="label">Tipo</legend>
          <Segmented v-model="values.kind" :options="kindOptions" label="Tipo" wrap />
        </fieldset>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Valor"
          :error="errors.amountCents ? 'Informe o valor' : null"
        >
          <MoneyInput
            :id="id"
            v-model="values.amountCents"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="clearError('amountCents')"
          />
        </Field>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Descrição"
          optional
          :error="errors.description"
        >
          <input
            :id="id"
            v-model="values.description"
            class="input"
            type="text"
            maxlength="500"
            placeholder="Ex.: passou roupa extra"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
          />
        </Field>
        <p class="muted ex__hint">
          Já pagou o extra na hora?
          <RouterLink :to="extraPaymentLink">Registre como pagamento extra</RouterLink>: ele aparece
          aqui e em Pagamentos.
        </p>
      </form>
      <template #footer>
        <Button @click="formOpen = false">Cancelar</Button>
        <Button type="submit" form="adjustment-form" variant="primary" :loading="submitting"
          >Lançar em {{ month.slice(5) }}/{{ month.slice(0, 4) }}</Button
        >
      </template>
    </Sheet>
  </div>
</template>

<style scoped>
.ex {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
  align-content: start;
}

.ex__filter {
  min-width: 14rem;
}

.ex__what {
  min-width: 0;
}

.ex__kind {
  font-weight: 600;
}

.ex__desc {
  font-size: var(--t-14);
  color: var(--brand);
  overflow-wrap: anywhere;
}

.ex__when {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ex__amt {
  white-space: nowrap;
  font-size: var(--t-14);
  font-weight: 600;
}

.ex__paid {
  display: block;
  font-family: var(--font-text);
  font-size: var(--t-12);
  color: var(--ink-2);
}

.is-minus {
  color: var(--coral-ink);
}

.ex__net {
  display: flex;
  justify-content: space-between;
  padding: var(--s-3) var(--s-4) 0;
  border-top: 3px double var(--ink);
  font-weight: 600;
}

.ex__set {
  border: 0;
  padding: 0;
  min-width: 0;
}

.ex__set legend {
  padding: 0;
  margin-bottom: var(--s-3);
}

.ex__hint a {
  color: var(--brand);
  font-weight: 600;
}

.ex__ro {
  font-size: var(--t-14);
  color: var(--ink-2);
}
</style>
