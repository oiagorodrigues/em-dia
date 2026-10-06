<script setup lang="ts">
import { formatCents, formatDuration, monthName, parseYearMonth } from "@emdia/shared";
import { computed } from "vue";
import { dashboardApi } from "@/api";
import ContractStub from "@/components/feature/ContractStub.vue";
import InstallHint from "@/components/feature/InstallHint.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useResource } from "@/composables/resource.ts";
import { firstName } from "@/lib/format.ts";
import { greeting } from "@/lib/greeting.ts";
import { useAuthStore } from "@/stores/auth.ts";

const auth = useAuthStore();
const { data, error, loading, reload } = useResource(
  () => 0,
  () => dashboardApi.get(),
);

const totals = computed(() => {
  const items = data.value?.items ?? [];
  return {
    minutes: items.reduce((s, i) => s + i.summary.totalMinutes, 0),
    due: items.reduce((s, i) => s + i.summary.dueCents, 0),
    paid: items.reduce((s, i) => s + i.summary.paidCents, 0),
    balance: items.reduce((s, i) => s + Math.max(0, i.summary.balanceCents), 0),
    missing: items.reduce((s, i) => s + i.summary.unrecordedDates.length, 0),
  };
});

const month = computed(() => (data.value ? monthName(parseYearMonth(data.value.month).month) : ""));
const hours = computed(() => formatDuration(totals.value.minutes));
</script>

<template>
  <div class="home">
    <header class="home__head">
      <p class="label">{{ greeting() }}, {{ firstName(auth.user?.name ?? "") }}</p>
      <h1 class="visually-hidden">Início</h1>
    </header>

    <section v-if="loading && !data" class="hero" aria-busy="true" aria-label="Carregando">
      <Skeleton w="40%" h="14px" />
      <Skeleton w="70%" h="72px" gap="12px" />
      <Skeleton w="55%" h="20px" gap="16px" />
      <Skeleton h="148px" gap="40px" />
      <Skeleton h="148px" gap="12px" />
    </section>

    <EmptyState v-else-if="error && !data" tone="error" title="Não deu para carregar o início.">
      {{ error.message }}
      <template #actions><Button icon="history" @click="reload">tentar de novo</Button></template>
    </EmptyState>

    <template v-else-if="data">
      <section v-if="data.items.length > 0" class="hero" aria-labelledby="hero-label">
        <p id="hero-label" class="label">horas em {{ month }}</p>
        <p class="hero__hours mono" :aria-label="`${hours} trabalhadas`">{{ hours }}</p>
        <div class="hero__money">
          <div>
            <p class="label">a pagar</p>
            <p class="hero__due mono">{{ formatCents(totals.balance) }}</p>
          </div>
          <div class="hero__paid">
            <p class="label">já pago</p>
            <p class="mono">{{ formatCents(totals.paid) }}</p>
          </div>
        </div>
      </section>

      <InstallHint />

      <section class="list" aria-labelledby="list-title">
        <div class="list__head">
          <h2 id="list-title" class="section-title">quem trabalha aqui</h2>
          <Button v-if="data.items.length > 0" to="/vinculos/novo" variant="ghost" icon="plus"
            >adicionar</Button
          >
        </div>

        <EmptyState v-if="data.items.length === 0" title="Ninguém cadastrado ainda.">
          Cadastre a diarista, babá ou cuidadora. Você recebe um código para a pessoa entrar e bater
          o ponto pelo celular.
          <template #actions>
            <Button to="/vinculos/novo" variant="primary" icon="plus"
              >adicionar profissional</Button
            >
          </template>
        </EmptyState>

        <ul v-else class="list__items">
          <li v-for="item in data.items" :key="item.contract.id">
            <ContractStub :item="item" />
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.home {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-7);
}

.home__head {
  margin-bottom: calc(var(--s-5) * -1);
}

.hero {
  display: grid;
}

.hero__hours {
  margin: var(--s-1) 0 var(--s-5);
  font-size: clamp(var(--t-64), 19vw, var(--t-96));
  font-weight: 600;
  letter-spacing: -0.06em;
  line-height: 0.95;
}

.hero__money {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--s-4) var(--s-8);
  padding-top: var(--s-4);
  border-top: 3px double var(--ink);
}

.hero__due {
  margin-top: 2px;
  font-size: var(--t-28);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.hero__paid .mono {
  margin-top: 2px;
  color: var(--ink-2);
}

.list {
  display: grid;
  gap: var(--s-4);
}

.list__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
}

.list__items {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--s-3);
}
</style>
