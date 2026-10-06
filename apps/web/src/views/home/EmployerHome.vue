<script setup lang="ts">
import {
  DEFAULT_TIMEZONE,
  formatCents,
  formatDuration,
  monthName,
  nowInZone,
  parseYearMonth,
  shiftMonth,
  toYearMonth,
  type YearMonth,
} from "@emdia/shared";
import { computed, ref } from "vue";
import { teamApi } from "@/api";
import HomePendencies from "@/components/feature/HomePendencies.vue";
import HomeToday from "@/components/feature/HomeToday.vue";
import InstallHint from "@/components/feature/InstallHint.vue";
import MonthSwitcher from "@/components/feature/MonthSwitcher.vue";
import TeamTable from "@/components/feature/TeamTable.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import KpiCard from "@/components/ui/KpiCard.vue";
import { useResource } from "@/composables/resource.ts";
import { useTableState } from "@/composables/tableState.ts";
import { firstName } from "@/lib/format.ts";
import { greeting } from "@/lib/greeting.ts";
import { pendencies, teamStatus, teamTotals } from "@/lib/team.ts";
import { useAuthStore } from "@/stores/auth.ts";

const auth = useAuthStore();
const today = nowInZone(DEFAULT_TIMEZONE).date;
const currentMonth = toYearMonth(today);
const month = ref<YearMonth>(currentMonth);

const team = useResource(month, (m) => teamApi.list(m));
const { state, clear } = useTableState({ defaultSort: { key: "nome", dir: "asc" } });

/** The dashboard is about the people working here now; ended and removed live in Equipe. */
const current = computed(() =>
  (team.data.value?.items ?? []).filter((i) => {
    const s = teamStatus(i.contract);
    return s === "active" || s === "pending";
  }),
);
const totals = computed(() => teamTotals(current.value, today));
const pending = computed(() => pendencies(current.value, today, month.value));
const pendingCount = computed(() => pending.value.length);
const monthLabel = computed(() => monthName(parseYearMonth(month.value).month));
const isCurrent = computed(() => month.value === currentMonth);

const pendingCaption = computed(() => {
  const t = totals.value;
  const parts = [
    t.late ? `${t.late} sem registro` : null,
    t.toConfirm ? `${t.toConfirm} a confirmar` : null,
    t.unacknowledged ? `${t.unacknowledged} sem “recebi”` : null,
    t.invites ? `${t.invites} ${t.invites === 1 ? "convite" : "convites"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "tudo em dia";
});
</script>

<template>
  <div class="eh">
    <header class="eh__head">
      <div>
        <p class="label">{{ greeting() }}, {{ firstName(auth.user?.name ?? "") }}</p>
        <h1 class="visually-hidden">Início</h1>
      </div>
      <MonthSwitcher v-model="month" :max="shiftMonth(currentMonth, 1)" class="eh__month" />
      <!-- Hidden while empty: the empty state carries the one "adicionar profissional" button. -->
      <div v-if="current.length > 0" class="eh__actions">
        <Button to="/equipe/novo" variant="primary" icon="plus">adicionar profissional</Button>
        <Button to="/pagamentos/novo" icon="wallet">registrar pagamento</Button>
      </div>
    </header>

    <EmptyState
      v-if="team.error.value && !team.data.value"
      tone="error"
      title="Não deu para carregar o início."
    >
      {{ team.error.value.message }}
      <template #actions
        ><Button icon="history" @click="team.reload">tentar de novo</Button></template
      >
    </EmptyState>

    <EmptyState
      v-else-if="team.data.value && current.length === 0"
      title="Ninguém cadastrado ainda."
      class="eh__empty"
    >
      Cadastre a diarista, babá ou cuidadora. Você recebe um código para a pessoa entrar e bater o
      ponto pelo celular.
      <template #actions>
        <Button to="/equipe/novo" variant="primary" icon="plus">adicionar profissional</Button>
      </template>
    </EmptyState>

    <template v-else>
      <section class="eh__kpis" aria-label="Resumo do mês">
        <KpiCard
          tint="mint"
          icon="clock"
          :label="`horas em ${monthLabel}`"
          :value="formatDuration(totals.minutes)"
          :caption="totals.people === 1 ? '1 pessoa' : `${totals.people} pessoas`"
          :loading="team.loading.value && !team.data.value"
        />
        <KpiCard
          tint="peach"
          icon="coins"
          label="a pagar"
          :value="formatCents(totals.balanceCents)"
          :caption="`de ${formatCents(totals.dueCents)} no mês`"
          :loading="team.loading.value && !team.data.value"
          to="/pagamentos"
        />
        <KpiCard
          tint="sky"
          icon="wallet"
          :label="`pago em ${monthLabel}`"
          :value="formatCents(totals.paidCents)"
          :caption="totals.paidCents > 0 ? 'referente ao mês' : 'nenhum pagamento ainda'"
          :loading="team.loading.value && !team.data.value"
        />
        <KpiCard
          tint="butter"
          icon="alert"
          label="pendências"
          :value="String(pendingCount)"
          :caption="pendingCaption"
          :loading="team.loading.value && !team.data.value"
        />
      </section>

      <InstallHint />

      <div class="eh__main">
        <section class="eh__team" aria-labelledby="eh-team">
          <h2 id="eh-team" class="section-title">quem trabalha aqui</h2>
          <TeamTable
            :items="current"
            :state="state"
            :today="today"
            :month="month"
            :loading="team.loading.value && !team.data.value"
            @reload="team.reload"
            @clear-filters="clear"
          />
        </section>
        <aside class="eh__side" aria-label="Hoje e pendências">
          <HomeToday v-if="isCurrent" :items="current" :today="today" @reload="team.reload" />
          <HomePendencies :items="pending" />
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.eh {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.eh__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-4);
  align-items: center;
}

.eh__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.eh__kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}

.eh__team {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-3);
  align-content: start;
}

.eh__side {
  display: grid;
  gap: var(--s-5);
  align-content: start;
  align-items: start;
}

@media (min-width: 960px) {
  .eh__head {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  .eh__month {
    min-width: 320px;
  }
  .eh__kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--s-5);
  }
}

/* The team table needs ~1000px for its columns and quick actions, so "hoje" and
   "pendências" only move beside it on very wide screens; otherwise they sit below, side by side. */
.eh__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

/* On phones "hoje" is what you open the app for, so it comes before the team list. */
@media (max-width: 959px) {
  .eh__side {
    order: -1;
  }
}

@media (min-width: 960px) {
  .eh__side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1600px) {
  .eh__main {
    grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
  }
  .eh__side {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
