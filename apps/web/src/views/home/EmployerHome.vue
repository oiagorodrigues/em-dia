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
import { isFutureMonth, pendencies, projectionTotals, teamStatus, teamTotals } from "@/lib/team.ts";
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
const future = computed(() => isFutureMonth(month.value, today));
const isCurrent = computed(() => month.value === currentMonth);
const totals = computed(() => teamTotals(current.value, today));
const projection = computed(() => projectionTotals(current.value));
const pending = computed(() => pendencies(current.value, today, month.value));
const monthLabel = computed(() => monthName(parseYearMonth(month.value).month));
const loadingFirst = computed(() => team.loading.value && !team.data.value);

const pendingCaption = computed(() => {
  const t = totals.value;
  const parts = [
    t.late ? `${t.late} sem registro` : null,
    t.toConfirm ? `${t.toConfirm} a confirmar` : null,
    t.unacknowledged ? `${t.unacknowledged} sem “recebi”` : null,
    t.invites ? `${t.invites} ${t.invites === 1 ? "convite" : "convites"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Tudo em dia";
});

const people = computed(() =>
  totals.value.people === 1 ? "1 pessoa" : `${totals.value.people} pessoas`,
);
</script>

<template>
  <div class="grid grid-cols-12 gap-6">
    <header class="col-span-12 grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_auto_auto]">
      <div>
        <p class="label">{{ greeting() }}, {{ firstName(auth.user?.name ?? "") }}</p>
        <h1 class="visually-hidden">Início</h1>
      </div>
      <MonthSwitcher v-model="month" :max="shiftMonth(currentMonth, 12)" class="lg:min-w-80" />
      <!-- Hidden while empty: the empty state carries the one "Adicionar profissional" button. -->
      <div v-if="current.length > 0" class="flex flex-wrap gap-2">
        <Button
          to="/equipe/novo"
          variant="primary"
          icon="user-plus"
          icon-only
          label="Adicionar profissional"
        />
        <Button to="/pagamentos/novo" icon="wallet-plus" icon-only label="Registrar pagamento" />
      </div>
    </header>

    <EmptyState
      v-if="team.error.value && !team.data.value"
      tone="error"
      title="Não deu para carregar o início."
      class="col-span-12"
    >
      {{ team.error.value.message }}
      <template #actions
        ><Button icon="refresh" @click="team.reload">Tentar de novo</Button></template
      >
    </EmptyState>

    <EmptyState
      v-else-if="team.data.value && current.length === 0"
      title="Ninguém cadastrado ainda."
      class="col-span-12"
    >
      Cadastre a diarista, babá ou cuidadora. Você recebe um código para a pessoa entrar e bater o
      ponto pelo celular.
      <template #actions>
        <Button to="/equipe/novo" variant="primary" icon="user-plus">Adicionar profissional</Button>
      </template>
    </EmptyState>

    <template v-else>
      <section v-if="future" class="kpi-grid col-span-12" :aria-label="`Previsão de ${monthLabel}`">
        <KpiCard
          projected
          tone="brand"
          icon="clock"
          :label="`Horas em ${monthLabel}`"
          :value="formatDuration(projection.minutes)"
          :amount="projection.minutes"
          :format="formatDuration"
          :caption="people"
          :loading="loadingFirst"
        />
        <KpiCard
          projected
          tone="amber"
          icon="coins"
          label="Custo"
          :value="formatCents(projection.cents)"
          :amount="projection.cents"
          :format="formatCents"
          :caption="
            projection.unpriced
              ? `sem estimativa para ${projection.unpriced} ${projection.unpriced === 1 ? 'pessoa' : 'pessoas'}`
              : 'se todos vierem nos dias combinados'
          "
          :loading="loadingFirst"
        />
        <KpiCard
          projected
          tone="brand"
          icon="calendar"
          label="Dias"
          :value="String(projection.days)"
          :amount="projection.days"
          :format="String"
          caption="dias e visitas combinados"
          :loading="loadingFirst"
        />
      </section>
      <section v-else class="kpi-grid col-span-12" :aria-label="`Resumo de ${monthLabel}`">
        <KpiCard
          tone="brand"
          icon="clock"
          :label="`Horas em ${monthLabel}`"
          :value="formatDuration(totals.minutes)"
          :amount="totals.minutes"
          :format="formatDuration"
          :caption="people"
          :loading="loadingFirst"
        />
        <KpiCard
          :tone="totals.balanceCents > 0 ? 'amber' : 'brand'"
          icon="coins"
          label="A pagar"
          :value="formatCents(totals.balanceCents)"
          :amount="totals.balanceCents"
          :format="formatCents"
          :caption="`de ${formatCents(totals.dueCents)} no mês`"
          :loading="loadingFirst"
          to="/pagamentos"
        />
        <KpiCard
          tone="brand"
          icon="wallet"
          :label="`Pago em ${monthLabel}`"
          :value="formatCents(totals.paidCents)"
          :amount="totals.paidCents"
          :format="formatCents"
          :caption="totals.paidCents > 0 ? 'referente ao mês' : 'nenhum pagamento ainda'"
          :loading="loadingFirst"
        />
        <KpiCard
          :tone="pending.length > 0 ? 'amber' : 'brand'"
          icon="alert"
          label="Pendências"
          :value="String(pending.length)"
          :caption="pendingCaption"
          :loading="loadingFirst"
        />
      </section>

      <InstallHint class="col-span-12" />

      <section
        class="order-2 col-span-12 grid content-start gap-3 lg:order-none"
        :class="{ '2xl:col-span-8': !future }"
        aria-labelledby="eh-team"
      >
        <h2 id="eh-team" class="section-title">
          {{ future ? `Previsão de ${monthLabel}` : "Quem trabalha aqui" }}
        </h2>
        <TeamTable
          :items="current"
          :state="state"
          :today="today"
          :month="month"
          :projected="future"
          :loading="loadingFirst"
          @reload="team.reload"
          @clear-filters="clear"
        />
      </section>

      <!-- On phones "hoje" is what you open the app for, so it comes before the team list. -->
      <aside
        v-if="!future"
        class="order-1 col-span-12 grid content-start items-start gap-5 lg:order-none lg:grid-cols-2 2xl:col-span-4 2xl:grid-cols-1"
        aria-label="Hoje e pendências"
      >
        <HomeToday v-if="isCurrent" :items="current" :today="today" @reload="team.reload" />
        <HomePendencies :items="pending" />
      </aside>
    </template>
  </div>
</template>
