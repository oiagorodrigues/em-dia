<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import { useAuthStore } from "@/stores/auth.ts";
import { navItems } from "./nav.ts";

const auth = useAuthStore();
const route = useRoute();
const items = computed(() => navItems(auth.role));
const active = computed(() => items.value.find((i) => i.match(route))?.to ?? null);
</script>

<template>
  <nav class="bb" aria-label="Principal">
    <ul class="bb__list" :style="{ '--n': items.length }">
      <li v-for="item in items" :key="item.to">
        <RouterLink
          :to="item.to"
          class="bb__item"
          :class="{ 'is-active': active === item.to }"
          :aria-current="active === item.to ? 'page' : undefined"
        >
          <span class="bb__icon"><Icon :name="item.icon" :size="22" /></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.bb {
  position: fixed;
  z-index: 30;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--surface);
  border-top: 1px solid var(--rule);
  box-shadow: 0 -4px 20px rgb(27 29 36 / 0.06);
  padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

@media (min-width: 960px) {
  .bb {
    display: none;
  }
}

.bb__list {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  height: var(--nav-h);
}

.bb__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 100%;
  color: var(--ink-2);
  text-decoration: none;
  font-size: 11px;
  font-weight: 600;
}

.bb__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 28px;
  border-radius: 14px;
  transition: background-color var(--d-fast) var(--ease);
}

.bb__item.is-active {
  color: var(--sidebar-ink);
}

.bb__item.is-active .bb__icon {
  background: var(--sidebar);
}

.bb__item:focus-visible {
  outline-offset: -4px;
}
</style>
