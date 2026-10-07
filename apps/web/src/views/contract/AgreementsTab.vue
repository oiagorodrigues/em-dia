<script setup lang="ts">
import { createAgreementSchema, formatCents, formatYearMonth, type Agreement } from "@emdia/shared";
import { computed, ref } from "vue";
import { agreementsApi, errorMessage } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import Button from "@/components/ui/Button.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import DataTable from "@/components/ui/DataTable.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Field from "@/components/ui/Field.vue";
import Icon from "@/components/ui/Icon.vue";
import MoneyInput from "@/components/ui/MoneyInput.vue";
import MonthField from "@/components/ui/MonthField.vue";
import Select from "@/components/ui/Select.vue";
import Sheet from "@/components/ui/Sheet.vue";
import StatusChip from "@/components/ui/StatusChip.vue";
import TableActions from "@/components/ui/TableActions.vue";
import type { InlineAction, MenuItem } from "@/components/ui/menu.ts";
import { useContract } from "@/composables/contractContext.ts";
import { useForm } from "@/composables/form.ts";
import { useInvalidate, useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import {
  agreementProgress,
  agreementStatus,
  isOpenAgreement,
  nextInstallmentCents,
  type AgreementState,
} from "@/lib/agreement.ts";
import { isWritable } from "@/lib/contract.ts";
import type { Column } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const { contract, month, currentMonth } = useContract();

const list = useResource(
  () => contract.value.id,
  queryKeys.agreements,
  (id) => agreementsApi.list(id, { archived: true }).then((r) => r.agreements),
);
const invalidate = useInvalidate();

const writable = computed(() => isWritable(contract.value));
const canCreate = computed(() => auth.isEmployer && writable.value);

const { state, clear } = useTableState({
  defaultSort: { key: "inicio", dir: "desc" },
  filters: ["situacao"],
  prefix: "ac_",
});

const STATE_OPTIONS: { value: "" | AgreementState; label: string }[] = [
  { value: "", label: "Todas as situações" },
  { value: "pending", label: "Aguardando concordar" },
  { value: "running", label: "Em andamento" },
  { value: "settled", label: "Quitados" },
  { value: "cancelled", label: "Cancelados" },
  { value: "removed", label: "Removidos" },
];

const columns: Column<Agreement>[] = [
  {
    key: "descricao",
    label: "Descrição",
    value: (a) => a.description,
    sortable: true,
    searchable: true,
  },
  {
    key: "inicio",
    label: "Início",
    value: (a) => a.startMonth,
    format: (a) => formatYearMonth(a.startMonth),
    sortable: true,
    sortFirst: "desc",
    hideBelow: "xl",
  },
  {
    key: "total",
    label: "Total",
    value: (a) => a.totalCents,
    format: (a) => formatCents(a.totalCents),
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
  {
    key: "abatido",
    label: "Abatido",
    value: (a) => a.settledCents,
    format: (a) => formatCents(a.settledCents),
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
  {
    key: "falta",
    label: "Falta",
    value: (a) => (isClosed(a) ? 0 : a.remainingCents),
    sortable: true,
    sortFirst: "desc",
    align: "right",
    mono: true,
  },
  {
    key: "parcela",
    label: "Parcela",
    value: (a) => a.installmentCents,
    format: (a) => (a.installmentCents === null ? "livre" : formatCents(a.installmentCents)),
    align: "right",
    mono: true,
    hideBelow: "lg",
  },
  {
    key: "situacao",
    label: "Situação",
    value: (a) => agreementStatus(a).label,
    sortable: true,
  },
];

const situacao = computed({
  get: () => state.filters.situacao ?? "",
  set: (v: string) => (state.filters.situacao = v),
});

/** Removed agreements only show up when the "Removidos" filter asks for them. */
const rows = computed(() => {
  const all = list.data.value ?? [];
  return situacao.value === "removed" ? all : all.filter((a) => !a.archivedAt);
});

function filter(a: Agreement): boolean {
  return !state.filters.situacao || agreementStatus(a).state === state.filters.situacao;
}

function isClosed(a: Agreement): boolean {
  return !!a.cancelledAt || !!a.archivedAt;
}

function replace(next: Agreement): void {
  list.mutate((l = []) => l.map((a) => (a.id === next.id ? next : a)));
  void invalidate.records(contract.value.id, list);
}

const busyId = ref<string | null>(null);
async function accept(a: Agreement): Promise<void> {
  busyId.value = a.id;
  try {
    replace((await agreementsApi.accept(contract.value.id, a.id)).agreement);
    toast.success("Pronto, você concordou com o acordo.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

async function restore(a: Agreement): Promise<void> {
  busyId.value = a.id;
  try {
    replace((await agreementsApi.restore(contract.value.id, a.id)).agreement);
    toast.success("Acordo restaurado.");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    busyId.value = null;
  }
}

const removing = ref<Agreement | null>(null);
const removeOpen = ref(false);
const removeBusy = ref(false);
function askRemove(a: Agreement): void {
  removing.value = a;
  removeOpen.value = true;
}
const removeMessage = computed(() =>
  removing.value && removing.value.settledCents > 0
    ? "As parcelas já abatidas saem dos pagamentos e do total pago. Dá para restaurar depois em Situação → Removidos."
    : "Dá para restaurar depois em Situação → Removidos.",
);
async function confirmRemove(): Promise<void> {
  const a = removing.value;
  if (!a) return;
  removeBusy.value = true;
  try {
    await agreementsApi.remove(contract.value.id, a.id);
    await invalidate.records(contract.value.id);
    removeOpen.value = false;
    toast.undoable("Acordo removido.", () => void restore(a));
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    removeBusy.value = false;
  }
}

function payLink(a: Agreement) {
  return {
    path: "/pagamentos/novo",
    query: { vinculo: contract.value.id, acordo: a.id, mes: month.value },
  };
}

function actionsFor(a: Agreement): { inline: InlineAction[]; menu: MenuItem[] } {
  const status = agreementStatus(a);
  const inline: InlineAction[] = [];
  const menu: MenuItem[] = [];
  if (auth.isEmployer && writable.value && status.state === "removed") {
    inline.push({
      label: "Restaurar",
      icon: "undo",
      loading: busyId.value === a.id,
      onClick: () => void restore(a),
    });
    return { inline, menu };
  }
  if (auth.isWorker && status.state === "pending" && writable.value)
    inline.push({
      label: "Concordo",
      icon: "check",
      tone: "brand",
      loading: busyId.value === a.id,
      onClick: () => void accept(a),
    });
  if (auth.isEmployer && writable.value && isOpenAgreement(a))
    inline.push({
      label: `Abater parcela de ${formatCents(nextInstallmentCents(a))}`,
      icon: "wallet-plus",
      tone: "brand",
      to: payLink(a),
    });
  if (auth.isEmployer && writable.value)
    menu.push({
      label: "Remover acordo",
      icon: "trash",
      danger: true,
      onSelect: () => askRemove(a),
    });
  return { inline, menu };
}

const formOpen = ref(false);
const { values, errors, formError, submitting, submit, clearError } = useForm(
  createAgreementSchema,
  {
    description: "",
    totalCents: null as number | null,
    installmentCents: null as number | null,
    startMonth: month.value > currentMonth ? month.value : currentMonth,
  },
);

function openForm(): void {
  values.description = "";
  values.totalCents = null;
  values.installmentCents = null;
  formOpen.value = true;
}

function onCreate(): void {
  const input = {
    description: values.description.trim(),
    totalCents: values.totalCents ?? 0,
    installmentCents: values.installmentCents || null,
    startMonth: values.startMonth,
  };
  void submit(async (data) => {
    const { agreement } = await agreementsApi.create(contract.value.id, data);
    list.mutate((l = []) => [agreement, ...l]);
    void invalidate.records(contract.value.id, list);
    formOpen.value = false;
    toast.success(
      contract.value.workerId
        ? `Acordo criado. ${contract.value.workerName} precisa concordar pelo app.`
        : "Acordo criado.",
    );
  }, input);
}

const totals = computed(() => {
  const open = (list.data.value ?? []).filter(isOpenAgreement);
  return {
    count: open.length,
    remaining: open.reduce((s, a) => s + a.remainingCents, 0),
  };
});
</script>

<template>
  <div class="ag">
    <p v-if="totals.count > 0" class="ag__sum">
      <span class="label">ainda falta abater</span>
      <span class="mono ag__sumv">{{ formatCents(totals.remaining) }}</span>
      <span class="ag__sumc"
        >em {{ totals.count }} {{ totals.count === 1 ? "acordo aberto" : "acordos abertos" }}</span
      >
    </p>

    <EmptyState
      v-if="list.error.value && !list.data.value"
      tone="error"
      title="Não deu para carregar os acordos."
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
      :row-key="(a) => a.id"
      :state="state"
      :default-sort="{ key: 'inicio', dir: 'desc' }"
      :filter="filter"
      :filters-active="!!state.filters.situacao"
      :filter-count="state.filters.situacao ? 1 : 0"
      :loading="list.loading.value && !list.data.value"
      label="Acordos"
      search-placeholder="Buscar acordo"
      :count-label="(n) => (n === 1 ? '1 acordo' : `${n} acordos`)"
      card-actions="below"
      @clear-filters="clear"
    >
      <template #filters>
        <Select v-model="situacao" :options="STATE_OPTIONS" label="Situação" class="ag__filter" />
      </template>

      <template v-if="canCreate" #actions>
        <Button variant="primary" icon="plus" @click="openForm">Novo acordo</Button>
      </template>

      <template #empty>
        <EmptyState title="Nenhum acordo ainda.">
          <template #mark><Icon name="handshake" :size="32" /></template>
          <template v-if="auth.isEmployer"
            >Para quando a profissional paga algo com trabalho, como um adiantamento. Você abate uma
            parte em cada pagamento.</template
          >
          <template v-else
            >Quando você pagar algo com trabalho, como um adiantamento, o acordo aparece
            aqui.</template
          >
        </EmptyState>
      </template>

      <template #cell-descricao="{ row }">
        <div class="ag__what">
          <span class="ag__desc">{{ row.description }}</span>
          <span
            class="ag__bar"
            role="progressbar"
            :aria-valuenow="agreementProgress(row)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`${agreementProgress(row)}% abatido`"
            ><span
              class="ag__fill"
              :class="{ 'is-off': isClosed(row) }"
              :style="{ width: `${agreementProgress(row)}%` }"
          /></span>
        </div>
      </template>

      <template #cell-abatido="{ row }">
        <span :class="{ 'is-brand': row.settledCents > 0 }">{{
          formatCents(row.settledCents)
        }}</span>
      </template>

      <template #cell-falta="{ row }">
        <span v-if="isClosed(row)" class="ag__muted">—</span>
        <span v-else :class="{ 'is-amber': row.remainingCents > 0 }">{{
          formatCents(row.remainingCents)
        }}</span>
      </template>

      <template #cell-situacao="{ row }">
        <StatusChip :tone="agreementStatus(row).tone">{{ agreementStatus(row).label }}</StatusChip>
      </template>

      <template #row-actions="{ row }">
        <TableActions
          :actions="actionsFor(row).inline"
          :menu="actionsFor(row).menu"
          :menu-label="`Mais ações do acordo ${row.description}`"
        />
      </template>

      <template #card="{ row }">
        <div class="ag__card">
          <div class="ag__cardhead">
            <span class="ag__desc">{{ row.description }}</span>
            <StatusChip :tone="agreementStatus(row).tone">{{
              agreementStatus(row).label
            }}</StatusChip>
          </div>
          <span class="ag__bar" aria-hidden="true"
            ><span
              class="ag__fill"
              :class="{ 'is-off': isClosed(row) }"
              :style="{ width: `${agreementProgress(row)}%` }"
          /></span>
          <dl class="ag__nums">
            <div>
              <dt>Abatido</dt>
              <dd class="mono">{{ formatCents(row.settledCents) }}</dd>
            </div>
            <div>
              <dt>Falta</dt>
              <dd class="mono">{{ isClosed(row) ? "—" : formatCents(row.remainingCents) }}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd class="mono">{{ formatCents(row.totalCents) }}</dd>
            </div>
            <div>
              <dt>Parcela</dt>
              <dd class="mono">
                {{ row.installmentCents === null ? "livre" : formatCents(row.installmentCents) }}
              </dd>
            </div>
          </dl>
        </div>
      </template>
    </DataTable>

    <Sheet v-model:open="formOpen" title="Novo acordo" :subtitle="contract.workerName">
      <form id="agreement-form" class="stack" novalidate @submit.prevent="onCreate">
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <p class="muted">
          Algo que {{ contract.workerName }} paga com trabalho. Cada mês você abate uma parcela no
          pagamento, e {{ contract.workerName }} confirma pelo app.
        </p>
        <Field v-slot="{ id, invalid, describedBy }" label="Descrição" :error="errors.description">
          <input
            :id="id"
            v-model="values.description"
            class="input"
            type="text"
            maxlength="200"
            placeholder="Ex.: mesa de jantar"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            @input="clearError('description')"
          />
        </Field>
        <div class="ag__two">
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="Valor total"
            :error="errors.totalCents ? 'Informe o valor total' : null"
          >
            <MoneyInput
              :id="id"
              v-model="values.totalCents"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="clearError('totalCents')"
            />
          </Field>
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="Parcela por mês"
            optional
            hint="Deixe em branco para abater quanto quiser a cada mês."
            :error="errors.installmentCents"
          >
            <MoneyInput
              :id="id"
              v-model="values.installmentCents"
              :invalid="invalid"
              :described-by="describedBy"
              @update:model-value="clearError('installmentCents')"
            />
          </Field>
        </div>
        <Field v-slot="{ id, invalid, describedBy }" label="Começa em" :error="errors.startMonth">
          <MonthField
            :id="id"
            v-model="values.startMonth"
            label="Começa em"
            :invalid="invalid"
            :described-by="describedBy"
          />
        </Field>
      </form>
      <template #footer>
        <Button @click="formOpen = false">Cancelar</Button>
        <Button type="submit" form="agreement-form" variant="primary" :loading="submitting"
          >Criar acordo</Button
        >
      </template>
    </Sheet>

    <ConfirmDialog
      v-model:open="removeOpen"
      :title="`Remover o acordo ${removing?.description ?? ''}?`"
      :message="removeMessage"
      confirm-label="Remover acordo"
      cancel-label="Voltar"
      :loading="removeBusy"
      @confirm="confirmRemove"
    />
  </div>
</template>

<style scoped>
.ag {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.ag__sum {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-1) var(--s-3);
}

.ag__sumv {
  font-size: var(--t-20);
  font-weight: 600;
  color: var(--amber-ink);
}

.ag__sumc {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.ag__filter {
  min-width: 14rem;
}

.ag__what {
  display: grid;
  gap: 6px;
  min-width: 10rem;
}

.ag__desc {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.ag__bar {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.ag__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand);
  transition: width var(--d-base) var(--ease);
}

.ag__fill.is-off {
  background: var(--ink-3);
}

.is-brand {
  color: var(--brand-ink);
}

.is-amber {
  color: var(--amber-ink);
}

.ag__muted {
  color: var(--ink-3);
}

.ag__card {
  display: grid;
  gap: var(--s-3);
  min-width: 0;
}

.ag__cardhead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
}

.ag__nums {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2) var(--s-4);
}

.ag__nums dt {
  font-size: var(--t-12);
  color: var(--ink-2);
}

.ag__nums dd {
  font-size: var(--t-14);
  font-stretch: 87.5%;
}

.ag__two {
  display: grid;
  gap: var(--s-4);
}

@media (min-width: 640px) {
  .ag__two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
