<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  nowInZone,
  OCCUPATION_LABEL,
  OCCUPATIONS,
  PAY_TYPE_LABEL,
  PAY_TYPES,
  toYearMonth,
  type DashboardItem,
} from "@emdia/shared";
import { computed } from "vue";
import { teamApi } from "@/api";
import TeamTable from "@/components/feature/TeamTable.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { inTab, tabCounts, TEAM_TAB_LABEL, TEAM_TABS, type TeamTab } from "@/lib/team.ts";

const today = nowInZone(DEFAULT_TIMEZONE).date;
const month = toYearMonth(today);

const team = useResource(
  () => month,
  (m) => teamApi.list(m, { archived: true }),
);
const items = computed(() => team.data.value?.items ?? []);

const { state, clear } = useTableState({
  defaultSort: { key: "nome", dir: "asc" },
  filters: ["status", "funcao", "pagamento"],
});

const tab = computed<TeamTab>({
  get: () =>
    ((TEAM_TABS as readonly string[]).includes(state.filters.status ?? "")
      ? state.filters.status
      : "ativos") as TeamTab,
  // "ativos" is the default and stays out of the URL.
  set: (t) => (state.filters.status = t === "ativos" ? "" : t),
});
const counts = computed(() => tabCounts(items.value));

/** Only offer the functions and pay types this household actually has. */
const occupations = computed(() =>
  OCCUPATIONS.filter((o) => items.value.some((i) => i.contract.occupation === o)),
);
const payTypes = computed(() =>
  PAY_TYPES.filter((p) => items.value.some((i) => i.contract.payType === p)),
);

const filter = (i: DashboardItem) =>
  inTab(i, tab.value) &&
  (!state.filters.funcao || i.contract.occupation === state.filters.funcao) &&
  (!state.filters.pagamento || i.contract.payType === state.filters.pagamento);
const filtersActive = computed(() => !!state.filters.funcao || !!state.filters.pagamento);
</script>

<template>
  <div class="team">
    <PageHeader title="equipe" subtitle="Quem trabalha ou já trabalhou na sua casa.">
      <template #actions>
        <Button to="/equipe/novo" variant="primary" icon="plus">adicionar profissional</Button>
      </template>
    </PageHeader>

    <EmptyState
      v-if="team.error.value && !team.data.value"
      tone="error"
      title="Não deu para carregar a equipe."
    >
      {{ team.error.value.message }}
      <template #actions><Button @click="team.reload">tentar de novo</Button></template>
    </EmptyState>

    <template v-else>
      <div class="team__tabs" role="group" aria-label="Situação">
        <button
          v-for="t in TEAM_TABS"
          :key="t"
          type="button"
          class="team__tab"
          :class="{ 'is-on': tab === t }"
          :aria-pressed="tab === t"
          @click="tab = t"
        >
          {{ TEAM_TAB_LABEL[t] }}
          <span class="team__tab-count mono">{{ counts[t] }}</span>
        </button>
      </div>

      <TeamTable
        variant="full"
        :items="items"
        :state="state"
        :today="today"
        :month="month"
        :filter="filter"
        :filters-active="filtersActive || tab !== 'ativos'"
        :loading="team.loading.value && !team.data.value"
        @reload="team.reload"
        @clear-filters="clear"
      >
        <template #filters>
          <label class="team__select">
            <span class="visually-hidden">Função</span>
            <select v-model="state.filters.funcao" class="input">
              <option value="">todas as funções</option>
              <option v-for="o in occupations" :key="o" :value="o">
                {{ OCCUPATION_LABEL[o] }}
              </option>
            </select>
          </label>
          <label class="team__select">
            <span class="visually-hidden">Forma de pagamento</span>
            <select v-model="state.filters.pagamento" class="input">
              <option value="">toda forma de pagamento</option>
              <option v-for="p in payTypes" :key="p" :value="p">{{ PAY_TYPE_LABEL[p] }}</option>
            </select>
          </label>
        </template>
        <template #empty>
          <EmptyState title="Ninguém cadastrado ainda.">
            Cadastre a diarista, babá ou cuidadora. Você recebe um código para a pessoa entrar e
            bater o ponto pelo celular.
            <template #actions>
              <Button to="/equipe/novo" variant="primary" icon="plus"
                >adicionar profissional</Button
              >
            </template>
          </EmptyState>
        </template>
      </TeamTable>
    </template>
  </div>
</template>

<style scoped>
.team {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

.team__tabs {
  display: flex;
  gap: var(--s-1);
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--rule);
}

.team__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: 0 var(--s-3);
  color: var(--ink-2);
  font-weight: 600;
  font-size: var(--t-14);
  white-space: nowrap;
}

.team__tab:hover {
  color: var(--ink);
}

.team__tab.is-on {
  color: var(--ink);
}

.team__tab.is-on::after {
  content: "";
  position: absolute;
  left: var(--s-3);
  right: var(--s-3);
  bottom: -1px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--blue);
}

.team__tab-count {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 11px;
  background: var(--surface-2);
  font-size: 11px;
  text-align: center;
}

.team__tab.is-on .team__tab-count {
  background: var(--blue-wash);
  color: var(--blue);
}

.team__select .input {
  min-height: 44px;
  padding: 0 var(--s-8) 0 var(--s-3);
  font-size: var(--t-14);
  color: var(--ink);
  background-image:
    linear-gradient(45deg, transparent 50%, var(--ink-2) 50%),
    linear-gradient(135deg, var(--ink-2) 50%, transparent 50%);
  background-position:
    right 18px center,
    right 13px center;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}
</style>
