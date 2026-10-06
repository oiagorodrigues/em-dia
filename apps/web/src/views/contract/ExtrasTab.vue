<script setup lang="ts">
import {
  ADJUSTMENT_KIND_LABEL,
  ADJUSTMENT_KINDS,
  ADJUSTMENT_SIGN,
  createAdjustmentSchema,
  formatCents,
  formatYearMonth,
  shiftMonth,
  toYearMonth,
  type Adjustment,
  type AdjustmentKind,
} from "@emdia/shared";
import { computed, ref } from "vue";
import { adjustmentsApi, errorMessage } from "@/api";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import Button from "@/components/ui/Button.vue";
import DataTable from "@/components/ui/DataTable.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Field from "@/components/ui/Field.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Select from "@/components/ui/Select.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import TableActions from "@/components/ui/TableActions.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useForm } from "@/composables/form.ts";
import { useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { formatRelative } from "@/lib/format.ts";
import type { Column } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import { isWritable } from "@/lib/contract.ts";

const auth = useAuthStore();
const toast = useToastStore();
const { contract, month, currentMonth, setMonth } = useContract();

const monthModel = computed({ get: () => month.value, set: setMonth });
const minMonth = computed(() => toYearMonth(contract.value.startedOn));
const maxMonth = computed(() =>
  contract.value.endedOn ? toYearMonth(contract.value.endedOn) : shiftMonth(currentMonth, 1),
);

const list = useResource(
  () => `${contract.value.id}|${month.value}`,
  () => adjustmentsApi.list(contract.value.id, month.value).then((r) => r.adjustments),
);

const net = computed(
  () => list.data.value?.reduce((s, a) => s + ADJUSTMENT_SIGN[a.kind] * a.amountCents, 0) ?? 0,
);
const canWrite = computed(() => auth.isEmployer && isWritable(contract.value));

const { state, clear } = useTableState({
  defaultSort: { key: "lancado", dir: "desc" },
  filters: ["tipo"],
  prefix: "ex_",
});

function signed(a: Adjustment): number {
  return ADJUSTMENT_SIGN[a.kind] * a.amountCents;
}

const columns: Column<Adjustment>[] = [
  {
    key: "mes",
    label: "Mês",
    value: (a) => a.month,
    format: (a) => formatYearMonth(a.month),
    hideBelow: "lg",
  },
  {
    key: "tipo",
    label: "Tipo",
    value: (a) => ADJUSTMENT_KIND_LABEL[a.kind],
    sortable: true,
    searchable: true,
  },
  { key: "descricao", label: "Descrição", value: (a) => a.description, searchable: true },
  {
    key: "lancado",
    label: "Lançado",
    value: (a) => a.createdAt,
    format: (a) => formatRelative(a.createdAt),
    sortable: true,
    sortFirst: "desc",
    mono: true,
    hideBelow: "xl",
  },
  {
    key: "valor",
    label: "Valor",
    value: signed,
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

function filter(a: Adjustment): boolean {
  if (state.filters.tipo === "mais") return ADJUSTMENT_SIGN[a.kind] > 0;
  if (state.filters.tipo === "menos") return ADJUSTMENT_SIGN[a.kind] < 0;
  return true;
}

const kindOptions = ADJUSTMENT_KINDS.map((k) => ({ value: k, label: ADJUSTMENT_KIND_LABEL[k] }));
const { values, errors, formError, submitting, submit, clearError } = useForm(
  createAdjustmentSchema,
  {
    kind: "bonus" as AdjustmentKind,
    amountCents: null as number | null,
    description: "",
  },
);

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
    values.amountCents = null;
    values.description = "";
    toast.success(`${ADJUSTMENT_KIND_LABEL[adjustment.kind]} lançado.`);
  }, input);
}

const removing = ref<string | null>(null);
async function remove(a: Adjustment): Promise<void> {
  removing.value = a.id;
  try {
    await adjustmentsApi.remove(contract.value.id, a.id);
    list.mutate((l = []) => l.filter((x) => x.id !== a.id));
    toast.success("Lançamento removido.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    removing.value = null;
  }
}
</script>

<template>
  <div class="ex">
    <div class="ex__main">
      <MonthSwitcher v-model="monthModel" :min="minMonth" :max="maxMonth" prefix="extras de" />

      <EmptyState
        v-if="list.error.value && !list.data.value"
        tone="error"
        title="Não deu para carregar os extras."
      >
        {{ list.error.value.message }}
        <template #actions><Button @click="list.reload">Tentar de novo</Button></template>
      </EmptyState>

      <DataTable
        v-else
        :rows="list.data.value ?? []"
        :columns="columns"
        :row-key="(a) => a.id"
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

        <template #empty>
          <EmptyState title="Nada lançado neste mês.">
            Extras, vale-transporte, adiantamentos e descontos entram aqui e mudam o valor do mês.
          </EmptyState>
        </template>

        <template #cell-tipo="{ row }">
          <StatusChip :tone="ADJUSTMENT_SIGN[row.kind] < 0 ? 'coral' : 'brand'">{{
            ADJUSTMENT_KIND_LABEL[row.kind]
          }}</StatusChip>
        </template>

        <template #cell-descricao="{ row }">
          <span class="ex__desc">{{ row.description ?? "—" }}</span>
        </template>

        <template #cell-valor="{ row }">
          <span :class="ADJUSTMENT_SIGN[row.kind] < 0 ? 'is-minus' : 'is-plus'"
            >{{ ADJUSTMENT_SIGN[row.kind] < 0 ? "−" : "+" }}
            {{ formatCents(row.amountCents) }}</span
          >
        </template>

        <template #card="{ row }">
          <div class="ex__what">
            <p class="ex__kind">{{ ADJUSTMENT_KIND_LABEL[row.kind] }}</p>
            <p v-if="row.description" class="ex__desc">{{ row.description }}</p>
            <p class="ex__when">{{ formatRelative(row.createdAt) }}</p>
          </div>
          <p class="ex__amt mono" :class="ADJUSTMENT_SIGN[row.kind] < 0 ? 'is-minus' : 'is-plus'">
            {{ ADJUSTMENT_SIGN[row.kind] < 0 ? "−" : "+" }} {{ formatCents(row.amountCents) }}
          </p>
        </template>

        <template v-if="canWrite" #row-actions="{ row }">
          <TableActions
            :actions="[
              {
                label: `Remover ${ADJUSTMENT_KIND_LABEL[row.kind]} de ${formatCents(row.amountCents)}`,
                icon: 'trash',
                tone: 'coral',
                loading: removing === row.id,
                onClick: () => void remove(row),
              },
            ]"
          />
        </template>
      </DataTable>

      <p v-if="list.data.value && list.data.value.length > 0" class="ex__net">
        <span>saldo dos lançamentos</span>
        <span class="mono" :class="{ 'is-minus': net < 0 }"
          >{{ net < 0 ? "−" : "+" }} {{ formatCents(Math.abs(net)) }}</span
        >
      </p>
    </div>

    <aside class="ex__aside">
      <form v-if="canWrite" class="ex__form sheet" novalidate @submit.prevent="onAdd">
        <h2 class="section-title">Lançar</h2>
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
        <Button type="submit" variant="primary" icon="plus" :loading="submitting"
          >Lançar em {{ month.slice(5) }}/{{ month.slice(0, 4) }}</Button
        >
      </form>
      <p v-else-if="auth.isWorker" class="ex__ro">
        Só quem contrata lança extras e descontos. Você vê tudo aqui.
      </p>
    </aside>
  </div>
</template>

<style scoped>
.ex {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.ex__main,
.ex__aside {
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

.ex__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
  padding: var(--s-5);
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

.ex__form > :deep(.btn) {
  justify-self: start;
}

.ex__ro {
  font-size: var(--t-14);
  color: var(--ink-2);
}

@media (min-width: 960px) {
  .ex {
    grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
    align-items: start;
  }
  .ex__aside {
    position: sticky;
    top: var(--s-6);
  }
}
</style>
