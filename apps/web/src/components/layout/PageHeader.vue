<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";
import { RouterLink } from "vue-router";
import Icon from "@/components/ui/Icon.vue";

const {
  title,
  lede,
  back,
  backLabel = "voltar",
} = defineProps<{
  title: string;
  lede?: string;
  back?: RouteLocationRaw;
  backLabel?: string;
}>();
</script>

<template>
  <header class="ph">
    <RouterLink v-if="back" :to="back" class="ph__back">
      <Icon name="arrow-left" :size="18" />
      <span>{{ backLabel }}</span>
    </RouterLink>
    <div class="ph__row">
      <div class="ph__text">
        <h1 class="page-title">{{ title }}</h1>
        <p v-if="lede" class="ph__lede">{{ lede }}</p>
      </div>
      <div v-if="$slots.actions" class="ph__actions"><slot name="actions" /></div>
    </div>
  </header>
</template>

<style scoped>
.ph {
  display: grid;
  gap: var(--s-2);
}

.ph__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 44px;
  margin: calc(var(--s-3) * -1) 0 0 -4px;
  justify-self: start;
  color: var(--ink-2);
  text-decoration: none;
  font-size: var(--t-14);
  font-weight: 600;
}

.ph__back:hover {
  color: var(--ink);
}

.ph__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-3);
}

.ph__text {
  min-width: 0;
}

.ph__lede {
  margin-top: var(--s-2);
  color: var(--ink-2);
}

.ph__actions {
  display: flex;
  gap: var(--s-2);
}
</style>
