<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  monthName,
  nowInZone,
  OCCUPATION_LABEL,
  OCCUPATIONS,
  parseYearMonth,
  PAY_TYPE_LABEL,
  PAY_TYPES,
  shiftMonth,
  toYearMonth,
  YEAR_MONTH_RE,
  type DashboardItem,
} from "@emdia/shared";
import { computed, useTemplateRef } from "vue";
import { teamApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import TeamTable from "@/components/feature/TeamTable.vue";
import PageHeader from "@/components/layout/PageHeader.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Select from "@/components/ui/Select.vue";
import { useInvalidate, useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { useSlidingIndicator } from "@/lib/motion.ts";
import {
  inTab,
  isFutureMonth,
  tabCounts,
  TEAM_TAB_LABEL,
  TEAM_TABS,
  type TeamTab,
} from "@/lib/team.ts";

const today = nowInZone(DEFAULT_TIMEZONE).date;
const currentMonth = toYearMonth(today);

const { state } = useTableState({
  defaultSort: { key: "nome", dir: "asc" },
  filters: ["status", "funcao", "pagamento", "mes"],
});

/** The month lives in `?mes=` with the other filters; the current month stays out of the URL. */
const month = computed({
  get: () => (YEAR_MONTH_RE.test(state.filters.mes ?? "") ? state.filters.mes! : currentMonth),
  set: (m: string) => (state.filters.mes = m === currentMonth ? "" : m),
});
const future = computed(() => isFutureMonth(month.value, today));

const team = useResource(month, queryKeys.teamWithArchived, (m) =>
  teamApi.list(m, { archived: true }),
);
const invalidate = useInvalidate();
const items = computed(() => team.data.value?.items ?? []);

const tab = computed<TeamTab>({
  get: () =>
    ((TEAM_TABS as readonly string[]).includes(state.filters.status ?? "")
      ? state.filters.status
      : "ativos") as TeamTab,
  // "ativos" is the default and stays out of the URL.
  set: (t) => (state.filters.status = t === "ativos" ? "" : t),
});
const tabsEl = useTemplateRef<HTMLElement>("tabsEl");
const tabIndicator = useSlidingIndicator(tabsEl, ".is-on", "x", () => tab.value);
const counts = computed(() => tabCounts(items.value));

/** Only offer the functions and pay types this household actually has. */
const occupationOptions = computed(() =>
  OCCUPATIONS.filter((o) => items.value.some((i) => i.contract.occupation === o)).map((o) => ({
    value: o as string,
    label: OCCUPATION_LABEL[o],
  })),
);
const payOptions = computed(() =>
  PAY_TYPES.filter((p) => items.value.some((i) => i.contract.payType === p)).map((p) => ({
    value: p as string,
    label: PAY_TYPE_LABEL[p],
  })),
);

/** Selects speak null for "todas"; the URL state speaks "". */
function filterModel(key: "funcao" | "pagamento") {
  return computed<string | null>({
    get: () => state.filters[key] || null,
    set: (v) => (state.filters[key] = v ?? ""),
  });
}
const funcao = filterModel("funcao");
const pagamento = filterModel("pagamento");

const filter = (i: DashboardItem) =>
  inTab(i, tab.value) &&
  (!state.filters.funcao || i.contract.occupation === state.filters.funcao) &&
  (!state.filters.pagamento || i.contract.payType === state.filters.pagamento);
const filterCount = computed(
  () => [state.filters.funcao, state.filters.pagamento].filter(Boolean).length,
);

/** "limpar" clears search and filters, but keeps the month and tab the person is looking at. */
function clearFilters(): void {
  state.q = "";
  state.filters.funcao = "";
  state.filters.pagamento = "";
}

const monthLabel = computed(() => monthName(parseYearMonth(month.value).month));
</script>

<template>
  <div class="grid grid-cols-12 gap-5">
    <PageHeader
      class="col-span-12"
      title="Equipe"
      :subtitle="
        future
          ? `Previsão de ${monthLabel}: dias, horas e custo se todos vierem nos dias combinados.`
          : 'Quem trabalha ou já trabalhou na sua casa.'
      "
    >
      <template #actions>
        <Button
          to="/equipe/novo"
          variant="primary"
          icon="user-plus"
          icon-only
          label="Adicionar profissional"
        />
      </template>
    </PageHeader>

    <div class="col-span-12 flex flex-wrap items-end justify-between gap-4">
      <div ref="tabsEl" class="team__tabs" role="group" aria-label="Situação">
        <span class="team__indicator" aria-hidden="true" :style="tabIndicator" />
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
      <MonthSwitcher v-model="month" :max="shiftMonth(currentMonth, 12)" class="w-full md:w-80" />
    </div>

    <EmptyState
      v-if="team.error.value && !team.data.value"
      tone="error"
      title="Não deu para carregar a equipe."
      class="col-span-12"
    >
      {{ team.error.value.message }}
      <template #actions
        ><Button icon="refresh" @click="team.reload">Tentar de novo</Button></template
      >
    </EmptyState>

    <div v-else class="col-span-12">
      <TeamTable
        variant="full"
        selectable
        :items="items"
        :state="state"
        :today="today"
        :month="month"
        :projected="future"
        :filter="filter"
        :filters-active="filterCount > 0 || tab !== 'ativos'"
        :filter-count="filterCount"
        :loading="team.loading.value && !team.data.value"
        @reload="invalidate.all"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <Select
            v-model="funcao"
            :options="occupationOptions"
            label="Função"
            placeholder="Todas as funções"
            class="team__select"
          />
          <Select
            v-model="pagamento"
            :options="payOptions"
            label="Forma de pagamento"
            placeholder="Toda forma de pagamento"
            class="team__select"
          />
          <Button v-if="filterCount > 0" variant="ghost" @click="clearFilters">Limpar</Button>
        </template>
        <template #empty>
          <EmptyState title="Ninguém cadastrado ainda.">
            Cadastre a diarista, babá ou cuidadora. Você recebe um código para a pessoa entrar e
            bater o ponto pelo celular.
            <template #actions>
              <Button to="/equipe/novo" variant="primary" icon="user-plus"
                >Adicionar profissional</Button
              >
            </template>
          </EmptyState>
        </template>
      </TeamTable>
    </div>
  </div>
</template>

<style scoped>
.team__tabs {
  position: relative;
  display: flex;
  gap: var(--s-1);
  max-width: 100%;
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
  transition: color var(--d-fast) var(--ease-out);
}

.team__tab:hover,
.team__tab.is-on {
  color: var(--ink);
}

.team__indicator {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--brand);
  pointer-events: none;
  transition:
    transform var(--d-sheet) var(--ease-out),
    width var(--d-sheet) var(--ease-out);
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
  background: var(--brand-wash);
  color: var(--brand-ink);
}

.team__select {
  min-width: 200px;
}
</style>
