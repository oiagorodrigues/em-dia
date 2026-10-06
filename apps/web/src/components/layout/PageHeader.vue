<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";
import { RouterLink } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import { useBack } from "@/composables/back.ts";

const {
  title,
  subtitle,
  back,
  backLabel = "voltar",
} = defineProps<{
  title: string;
  subtitle?: string;
  /** Where "voltar" goes when the page was opened directly; otherwise it returns to the previous screen. */
  back?: RouteLocationRaw;
  backLabel?: string;
}>();

const backNav = useBack(back ?? "/");
</script>

<template>
  <header class="ph">
    <RouterLink v-if="back" :to="backNav.to.value" class="ph__back" @click.prevent="backNav.go">
      <Icon name="arrow-left" :size="18" />
      <span>{{ backLabel }}</span>
    </RouterLink>
    <div class="ph__row">
      <div class="ph__text">
        <slot name="eyebrow" />
        <h1 class="ph__title">{{ title }}</h1>
        <p v-if="subtitle || $slots.subtitle" class="ph__sub">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
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
  gap: var(--s-3) var(--s-5);
}

.ph__text {
  min-width: 0;
}

.ph__title {
  font-size: clamp(var(--t-28), 3vw, var(--t-40));
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variation-settings: "opsz" 96;
  line-height: 1.05;
}

.ph__sub {
  margin-top: var(--s-2);
  color: var(--ink-2);
}

.ph__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.ph__title::first-letter {
  text-transform: uppercase;
}
</style>
