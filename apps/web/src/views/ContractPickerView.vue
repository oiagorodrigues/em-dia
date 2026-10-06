<script setup lang="ts">
import { OCCUPATION_LABEL } from "@emdia/shared";
import { computed, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { contractsApi } from "@/api";
import PageHeader from "@/components/layout/PageHeader.vue";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Icon from "@/components/ui/Icon.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import Stamp from "@/components/ui/Stamp.vue";
import { useResource } from "@/composables/resource.ts";
import { useAuthStore } from "@/stores/auth.ts";

const { tab } = defineProps<{ tab: "card" | "payments" }>();

const auth = useAuthStore();
const router = useRouter();
const routeName = computed(() => (tab === "card" ? "contract-card" : "contract-payments"));

const { data, error, loading, reload } = useResource(
  () => 0,
  () => contractsApi.list().then((r) => r.contracts),
);

const sorted = computed(() =>
  [...(data.value ?? [])].sort((a, b) =>
    a.status === b.status
      ? a.workerName.localeCompare(b.workerName)
      : a.status === "active"
        ? -1
        : 1,
  ),
);

// With a single contract there is nothing to choose; go straight to it.
watch(data, (list) => {
  const active = list?.filter((c) => c.status === "active") ?? [];
  if (list && active.length === 1 && list.length === 1) {
    void router.replace({ name: routeName.value, params: { id: active[0]!.id } });
  }
});

const title = computed(() => (tab === "card" ? "cartão" : "pagamentos"));
</script>

<template>
  <div class="pk">
    <PageHeader :title="title" :lede="auth.isEmployer ? 'De quem?' : 'De qual casa?'" />

    <div v-if="loading || (data && data.length === 1)" aria-busy="true">
      <Skeleton h="72px" />
      <Skeleton h="72px" gap="8px" />
    </div>
    <EmptyState v-else-if="error" tone="error" title="Não deu para carregar.">
      {{ error.message }}
      <template #actions><Button @click="reload">tentar de novo</Button></template>
    </EmptyState>
    <EmptyState
      v-else-if="sorted.length === 0"
      :title="
        auth.isEmployer ? 'Ninguém cadastrado ainda.' : 'Você ainda não está em nenhum vínculo.'
      "
    >
      <template #actions>
        <Button v-if="auth.isEmployer" to="/vinculos/novo" variant="primary" icon="plus"
          >adicionar profissional</Button
        >
        <Button v-else to="/entrar-no-vinculo" variant="primary" icon="key">tenho um código</Button>
      </template>
    </EmptyState>
    <ul v-else class="pk__list">
      <li v-for="c in sorted" :key="c.id">
        <RouterLink
          :to="{ name: routeName, params: { id: c.id } }"
          class="pk__item"
          :class="{ 'is-ended': c.status === 'ended' }"
        >
          <span class="pk__who">
            <span class="pk__name">{{ auth.isEmployer ? c.workerName : c.employerName }}</span>
            <span class="pk__sub"
              >{{ OCCUPATION_LABEL[c.occupation] }} · {{ c.householdName }}</span
            >
          </span>
          <Stamp v-if="c.status === 'ended'" text="encerrado" tone="ink" size="sm" />
          <Icon name="chevron-right" />
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pk {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.pk__list {
  list-style: none;
  padding: 0;
  background: var(--sheet);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
}

.pk__list li + li {
  border-top: 1px solid var(--rule);
}

.pk__item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 72px;
  padding: var(--s-3) var(--s-4);
  color: inherit;
  text-decoration: none;
}

.pk__item:hover {
  background: var(--paper);
}

.pk__item:focus-visible {
  outline-offset: -2px;
}

.pk__item.is-ended {
  color: var(--ink-2);
}

.pk__who {
  flex: 1;
  display: grid;
  min-width: 0;
}

.pk__name {
  font-weight: 700;
  font-size: var(--t-16);
}

.pk__sub {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.pk__item > :last-child {
  color: var(--ink-3);
}
</style>
