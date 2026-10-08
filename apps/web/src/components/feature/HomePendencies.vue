<script setup lang="ts">
import { RouterLink } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import type { Pendency } from "@/lib/team.ts";

const {
  items,
  limit = 6,
  loading = false,
} = defineProps<{ items: readonly Pendency[]; limit?: number; loading?: boolean }>();
</script>

<template>
  <section class="hp sheet" aria-labelledby="hp-title">
    <header class="hp__head">
      <h2 id="hp-title" class="section-title">Pendências</h2>
      <span v-if="items.length && !loading" class="hp__count mono">{{ items.length }}</span>
    </header>
    <ul v-if="loading" class="hp__list" aria-busy="true">
      <li v-for="i in 3" :key="i" class="hp__item">
        <Skeleton w="8px" h="8px" round />
        <Skeleton :w="['70%', '55%', '62%'][i - 1]" h="14px" />
      </li>
    </ul>
    <p v-else-if="items.length === 0" class="hp__empty">
      <Icon name="check" :size="18" />
      Tudo em dia.
    </p>
    <ul v-else class="hp__list">
      <li v-for="p in items.slice(0, limit)" :key="p.key">
        <RouterLink :to="p.to" class="hp__item">
          <span class="hp__dot" :class="`is-${p.tone}`" aria-hidden="true" />
          <span class="hp__text">{{ p.text }}</span>
          <Icon name="chevron-right" :size="16" />
        </RouterLink>
      </li>
    </ul>
    <p v-if="items.length > limit" class="hp__more">E mais {{ items.length - limit }}</p>
  </section>
</template>

<style scoped>
.hp {
  display: grid;
  align-content: start;
  gap: var(--s-3);
  padding: var(--s-5);
}

.hp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hp__count {
  min-width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0 8px;
  border-radius: 13px;
  background: var(--amber-wash);
  color: var(--amber-ink);
  font-size: var(--t-12);
  font-weight: 700;
}

.hp__empty {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-14);
  color: var(--brand);
  font-weight: 600;
}

.hp__list {
  list-style: none;
  padding: 0;
  display: grid;
  margin: 0 calc(var(--s-3) * -1);
}

.hp__item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 44px;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-1);
  color: var(--ink);
  text-decoration: none;
  font-size: var(--t-14);
}

.hp__item:hover {
  background: var(--surface-2);
}

.hp__item > .icon {
  color: var(--ink-3);
}

.hp__text {
  flex: 1;
  min-width: 0;
}

.hp__dot {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
}

.hp__dot.is-coral {
  background: var(--coral);
}

.hp__dot.is-amber {
  background: var(--amber-ink);
}

.hp__dot.is-brand {
  background: var(--brand-ink);
}

.hp__more {
  font-size: var(--t-12);
  color: var(--ink-2);
}
</style>
