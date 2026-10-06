<script setup lang="ts">
import { OCCUPATION_LABEL } from "@emdia/shared";
import { computed } from "vue";
import BoardGrid from "@/components/feature/BoardGrid.vue";
import BoardLegend from "@/components/feature/BoardLegend.vue";
import BoardWeekList from "@/components/feature/BoardWeekList.vue";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Icon from "@/components/ui/Icon.vue";
import Segmented from "@/components/ui/Segmented.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useMonthQuery } from "@/composables/contractContext.ts";
import { useMonthBoard } from "@/composables/monthBoard.ts";
import { useTableState } from "@/composables/tableState.ts";
import { BOARD_STATUS_FILTERS, matchesBoardStatus, type BoardRow } from "@/lib/board.ts";
import { MQ, useMediaQuery } from "@/lib/media.ts";
import { nextSort, searchRows, sortRows, type Column, type SortDir } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";
import ContractPickerView from "./ContractPickerView.vue";

const auth = useAuthStore();
const wide = useMediaQuery(MQ.md);
const { month, currentMonth, setMonth } = useMonthQuery();
const monthModel = computed({ get: () => month.value, set: setMonth });

const board = useMonthBoard(() => month.value);
const { state, active, clear } = useTableState({
  defaultSort: { key: "nome", dir: "asc" },
  filters: ["status"],
});

const columns: Column<BoardRow>[] = [
  {
    key: "nome",
    label: "Profissional",
    value: (r) => r.item.contract.workerName,
    searchable: true,
  },
  {
    key: "funcao",
    label: "Função",
    value: (r) => OCCUPATION_LABEL[r.item.contract.occupation],
    searchable: true,
  },
  { key: "horas", label: "Horas", value: (r) => r.item.summary.totalMinutes },
  { key: "apagar", label: "A pagar", value: (r) => r.item.summary.balanceCents },
];

const statusModel = computed({
  get: () => state.filters.status ?? "",
  set: (v: string) => (state.filters.status = v),
});

const allRows = computed(() => board.data.value?.rows ?? []);
const shown = computed(() => {
  const byStatus = allRows.value.filter((r) =>
    matchesBoardStatus(r.item.contract, state.filters.status ?? ""),
  );
  return sortRows(searchRows(byStatus, columns, state.q), columns, state.sort);
});

function sortBy(key: string, firstDir: SortDir): void {
  state.sort = nextSort(state.sort, key, firstDir);
}

const sortModel = computed({
  get: () => (state.sort ? `${state.sort.dir === "desc" ? "-" : ""}${state.sort.key}` : "nome"),
  set: (v: string) =>
    (state.sort = v.startsWith("-") ? { key: v.slice(1), dir: "desc" } : { key: v, dir: "asc" }),
});

const count = computed(() =>
  shown.value.length === 1 ? "1 pessoa" : `${shown.value.length} pessoas`,
);
</script>

<template>
  <ContractPickerView v-if="!auth.isEmployer" tab="card" />
  <div v-else class="bv">
    <PageHeader title="cartão" subtitle="O mês de todo mundo, dia a dia.">
      <template #actions>
        <Button to="/pagamentos/novo" icon="coins">registrar pagamento</Button>
      </template>
    </PageHeader>

    <div class="bv__month">
      <MonthSwitcher v-model="monthModel" class="bv__switch" />
      <BoardLegend class="bv__legend" />
    </div>

    <div class="bv__toolbar">
      <label class="bv__search">
        <Icon name="search" :size="18" />
        <span class="visually-hidden">Buscar por nome ou função</span>
        <input
          v-model="state.q"
          type="search"
          class="bv__search-input"
          placeholder="Buscar por nome ou função"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <Segmented
        v-model="statusModel"
        :options="BOARD_STATUS_FILTERS"
        label="Mostrar"
        class="bv__status"
      />
      <label v-if="!wide" class="bv__sort">
        <span class="label">ordem</span>
        <select v-model="sortModel" class="input">
          <option value="nome">nome</option>
          <option value="-horas">mais horas</option>
          <option value="-apagar">mais a pagar</option>
        </select>
      </label>
      <p class="bv__count" aria-live="polite">
        {{ board.loading.value && !board.data.value ? "carregando…" : count }}
      </p>
    </div>

    <div v-if="board.loading.value && !board.data.value" aria-busy="true" class="bv__loading">
      <Skeleton v-for="i in 4" :key="i" h="56px" :gap="i === 1 ? '0' : '6px'" />
    </div>

    <EmptyState v-else-if="board.error.value" tone="error" title="Não deu para carregar o quadro.">
      {{ board.error.value.message }}
      <template #actions><Button @click="board.reload">tentar de novo</Button></template>
    </EmptyState>

    <EmptyState v-else-if="allRows.length === 0" title="Ninguém cadastrado ainda.">
      Cadastre quem trabalha na sua casa e o mês de cada um aparece aqui.
      <template #actions>
        <Button to="/equipe/novo" variant="primary" icon="plus">adicionar profissional</Button>
      </template>
    </EmptyState>

    <div v-else-if="shown.length === 0" class="bv__none" role="status">
      <p>
        Ninguém
        {{ state.q.trim() ? `com “${state.q.trim()}”` : "" }}
        {{ state.filters.status === "encerrados" ? "encerrado" : "" }} neste mês.
      </p>
      <button v-if="active" type="button" class="link-btn" @click="clear">
        limpar busca e filtros
      </button>
    </div>

    <template v-else-if="board.data.value">
      <BoardGrid
        v-if="wide"
        :rows="shown"
        :month="board.data.value.month"
        :today="board.data.value.today"
        :current-month="currentMonth"
        :sort="state.sort"
        :aria-busy="board.loading.value || undefined"
        @sort="sortBy"
      />
      <BoardWeekList
        v-else
        :rows="shown"
        :month="board.data.value.month"
        :today="board.data.value.today"
        :current-month="currentMonth"
      />
      <p v-if="wide" class="bv__hint">
        Passe o mouse ou use as setas num dia para ver as horas. Enter abre o cartão da pessoa.
      </p>
    </template>
  </div>
</template>

<style scoped>
.bv {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.bv__month {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4) var(--s-6);
}

.bv__switch {
  width: min(100%, 360px);
}

.bv__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
}

.bv__search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 220px;
  max-width: 360px;
  color: var(--ink-3);
}

.bv__search > .icon {
  position: absolute;
  left: var(--s-3);
  pointer-events: none;
}

.bv__search-input {
  width: 100%;
  min-height: 44px;
  padding: 0 var(--s-3) 0 calc(var(--s-3) + 26px);
  border: 1px solid var(--rule);
  border-radius: var(--r-1);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--t-14);
}

.bv__search-input::placeholder {
  color: var(--ink-3);
}

.bv__search-input:focus {
  outline: none;
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--blue-wash);
}

.bv__status {
  flex: 0 0 auto;
}

.bv__sort {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.bv__sort .input {
  min-height: 44px;
  width: auto;
}

.bv__count {
  margin-left: auto;
  font-size: var(--t-12);
  color: var(--ink-2);
  white-space: nowrap;
}

.bv__none {
  display: grid;
  justify-items: center;
  gap: var(--s-2);
  padding: var(--s-8) var(--s-5);
  border: 1px dashed var(--rule);
  border-radius: var(--r-2);
  color: var(--ink-2);
  text-align: center;
}

.bv__hint {
  font-size: var(--t-12);
  color: var(--ink-3);
}

@media (max-width: 639px) {
  .bv__search {
    flex-basis: 100%;
    max-width: none;
  }
  .bv__legend {
    gap: var(--s-2) var(--s-4);
  }
}
</style>
