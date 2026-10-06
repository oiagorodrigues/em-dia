<script setup lang="ts">
import { computed } from "vue";
import { contractsApi } from "@/api";
import Button from "@/components/ui/Button.vue";
import DataTable from "@/components/ui/DataTable.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { activityGroup, describeActivity, type ActivityLine } from "@/lib/activity.ts";
import { formatRelative } from "@/lib/format.ts";
import type { Column } from "@/lib/table.ts";
import { useAuthStore } from "@/stores/auth.ts";

interface Line extends ActivityLine {
  id: string;
  at: string;
  group: ReturnType<typeof activityGroup>;
}

const auth = useAuthStore();
const { contract } = useContract();

const feed = useResource(
  () => contract.value.id,
  (id) => contractsApi.activity(id, 200).then((r) => r.activity),
);

const lines = computed<Line[]>(
  () =>
    feed.data.value?.map((item) => ({
      id: item.id,
      at: item.at,
      group: activityGroup(item.action),
      ...describeActivity(item, auth.user?.id ?? null),
    })) ?? [],
);

const { state, clear } = useTableState({
  defaultSort: { key: "quando", dir: "desc" },
  filters: ["tipo"],
  prefix: "hi_",
});

const GROUPS = [
  { value: "", label: "tudo" },
  { value: "registros", label: "registros" },
  { value: "pagamentos", label: "pagamentos e extras" },
  { value: "vinculo", label: "vínculo" },
] as const;

const counts = computed(() => {
  const c: Record<string, number> = { "": lines.value.length };
  for (const l of lines.value) c[l.group] = (c[l.group] ?? 0) + 1;
  return c;
});

const columns: Column<Line>[] = [
  {
    key: "quando",
    label: "Quando",
    value: (l) => l.at,
    format: (l) => formatRelative(l.at),
    sortable: true,
    sortFirst: "desc",
    mono: true,
    width: "11rem",
  },
  {
    key: "quem",
    label: "Quem",
    value: (l) => l.actor,
    sortable: true,
    searchable: true,
    width: "12rem",
  },
  {
    key: "oque",
    label: "O quê",
    value: (l) => l.text,
    search: (l) => l.value ?? "",
    searchable: true,
  },
];

function filter(l: Line): boolean {
  return !state.filters.tipo || l.group === state.filters.tipo;
}
</script>

<template>
  <div class="hi">
    <EmptyState
      v-if="feed.error.value && !feed.data.value"
      tone="error"
      title="Não deu para carregar o histórico."
    >
      {{ feed.error.value.message }}
      <template #actions><Button @click="feed.reload">tentar de novo</Button></template>
    </EmptyState>

    <DataTable
      v-else
      :rows="lines"
      :columns="columns"
      :row-key="(l) => l.id"
      :state="state"
      :default-sort="{ key: 'quando', dir: 'desc' }"
      :filter="filter"
      :filters-active="!!state.filters.tipo"
      :loading="feed.loading.value && !feed.data.value"
      label="Histórico do vínculo"
      search-placeholder="Buscar pessoa ou ação"
      :count-label="(n) => (n === 1 ? '1 evento' : `${n} eventos`)"
      @clear-filters="clear"
    >
      <template #filters>
        <div class="hi__chips" role="radiogroup" aria-label="Tipo">
          <button
            v-for="g in GROUPS"
            :key="g.value"
            type="button"
            role="radio"
            class="hi__chip"
            :aria-checked="state.filters.tipo === g.value"
            @click="state.filters.tipo = g.value"
          >
            {{ g.label }}
            <span class="mono hi__count">{{ counts[g.value] ?? 0 }}</span>
          </button>
        </div>
      </template>

      <template #empty>
        <EmptyState title="Nada aconteceu ainda.">
          Cada anotação, confirmação e pagamento fica registrado aqui, com quem fez e quando.
        </EmptyState>
      </template>

      <template #cell-quando="{ row }">
        <time :datetime="row.at">{{ formatRelative(row.at) }}</time>
      </template>

      <template #cell-quem="{ row }">
        <strong>{{ row.actor }}</strong>
      </template>

      <template #cell-oque="{ row }">
        <span class="hi__what" :class="`tone-${row.tone}`">
          <span class="hi__mark" aria-hidden="true" />
          <span>
            {{ row.text }}
            <span v-if="row.value" class="mono hi__value">{{ row.value }}</span>
          </span>
        </span>
      </template>

      <template #card="{ row }">
        <div class="hi__item" :class="`tone-${row.tone}`">
          <span class="hi__mark" aria-hidden="true" />
          <p class="hi__text">
            <strong>{{ row.actor }}</strong> {{ row.text }}
            <span v-if="row.value" class="mono hi__value">{{ row.value }}</span>
          </p>
          <time class="hi__at mono" :datetime="row.at">{{ formatRelative(row.at) }}</time>
        </div>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.hi__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.hi__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 36px;
  padding: 0 var(--s-3);
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: var(--t-14);
  font-weight: 600;
}

.hi__chip:hover {
  color: var(--ink);
}

.hi__chip[aria-checked="true"] {
  background: var(--tint-sky);
  border-color: transparent;
  color: var(--tint-sky-ink);
}

.hi__count {
  font-size: var(--t-12);
  opacity: 0.75;
}

.hi__what {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.hi__mark {
  flex: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--surface);
  border: 1.5px solid var(--ink-3);
}

.tone-ok .hi__mark {
  background: var(--green);
  border-color: var(--green);
}

.tone-alert .hi__mark {
  background: var(--red);
  border-color: var(--red);
}

.tone-money .hi__mark {
  border-color: var(--blue);
  background: var(--blue-wash);
}

.hi__value {
  margin-left: var(--s-1);
  font-size: var(--t-12);
  color: var(--blue);
  white-space: nowrap;
}

.hi__item {
  display: grid;
  grid-template-columns: 11px 1fr;
  gap: var(--s-1) var(--s-3);
  align-items: baseline;
}

.hi__item .hi__mark {
  align-self: center;
}

.hi__text {
  font-size: var(--t-14);
  line-height: 1.45;
  min-width: 0;
}

.hi__at {
  grid-column: 2;
  font-size: 11px;
  color: var(--ink-2);
}

.hi :deep(.dt__card) {
  padding: var(--s-3) var(--s-4);
}
</style>
