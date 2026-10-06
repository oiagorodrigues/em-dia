<script setup lang="ts">
import { computed } from "vue";
import { contractsApi } from "@/api";
import Button from "@/components/ui/Button.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useContract } from "@/composables/contractContext.ts";
import { useResource } from "@/composables/resource.ts";
import { describeActivity } from "@/lib/activity.ts";
import { formatRelative } from "@/lib/format.ts";
import { useAuthStore } from "@/stores/auth.ts";

const auth = useAuthStore();
const { contract } = useContract();

const feed = useResource(
  () => contract.value.id,
  (id) => contractsApi.activity(id, 100).then((r) => r.activity),
);

const lines = computed(
  () =>
    feed.data.value?.map((item) => ({
      id: item.id,
      at: item.at,
      ...describeActivity(item, auth.user?.id ?? null),
    })) ?? [],
);
</script>

<template>
  <div class="hi">
    <div v-if="feed.loading.value && !feed.data.value" aria-busy="true">
      <Skeleton v-for="i in 6" :key="i" h="44px" :gap="i === 1 ? '0' : '12px'" />
    </div>
    <EmptyState
      v-else-if="feed.error.value"
      tone="error"
      title="Não deu para carregar o histórico."
    >
      {{ feed.error.value.message }}
      <template #actions><Button @click="feed.reload">tentar de novo</Button></template>
    </EmptyState>
    <EmptyState v-else-if="lines.length === 0" title="Nada aconteceu ainda.">
      Cada anotação, confirmação e pagamento fica registrado aqui, com quem fez e quando.
    </EmptyState>
    <ol v-else class="hi__feed">
      <li v-for="line in lines" :key="line.id" class="hi__item" :class="`tone-${line.tone}`">
        <span class="hi__mark" aria-hidden="true" />
        <p class="hi__text">
          <strong>{{ line.actor }}</strong> {{ line.text }}
          <span v-if="line.value" class="mono hi__value">{{ line.value }}</span>
        </p>
        <time class="hi__at mono" :datetime="line.at">{{ formatRelative(line.at) }}</time>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.hi__feed {
  list-style: none;
  padding: 0;
  position: relative;
}

.hi__feed::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 12px;
  bottom: 12px;
  border-left: 1px dashed var(--rule);
}

.hi__item {
  position: relative;
  display: grid;
  grid-template-columns: 11px 1fr auto;
  gap: var(--s-1) var(--s-4);
  align-items: baseline;
  padding: var(--s-3) 0;
}

.hi__mark {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--paper);
  border: 1.5px solid var(--ink-3);
  align-self: center;
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

.hi__text {
  font-size: var(--t-14);
  line-height: 1.45;
  min-width: 0;
}

.hi__text strong {
  font-weight: 700;
}

.hi__value {
  margin-left: var(--s-1);
  font-size: var(--t-12);
  color: var(--blue);
  white-space: nowrap;
}

.hi__at {
  font-size: 11px;
  color: var(--ink-2);
  white-space: nowrap;
}

@media (max-width: 420px) {
  .hi__item {
    grid-template-columns: 11px 1fr;
  }
  .hi__at {
    grid-column: 2;
  }
}
</style>
