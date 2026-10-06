<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import type { IconName } from "@/components/ui/icons.ts";
import Wordmark from "@/components/ui/Wordmark.vue";
import { useAuthStore } from "@/stores/auth.ts";

const route = useRoute();
const auth = useAuthStore();

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  match: (path: string, name: unknown) => boolean;
}

const items: NavItem[] = [
  { to: "/", label: "Início", icon: "home", match: (p) => p === "/" },
  {
    to: "/cartao",
    label: "Cartão",
    icon: "card",
    match: (p, n) =>
      p === "/cartao" ||
      (p.startsWith("/vinculos/") && n !== "contract-payments" && p !== "/vinculos/novo"),
  },
  {
    to: "/pagamentos",
    label: "Pagamentos",
    icon: "wallet",
    match: (p, n) => p.startsWith("/pagamentos") || n === "contract-payments",
  },
  { to: "/perfil", label: "Perfil", icon: "user", match: (p) => p === "/perfil" },
];

const active = computed(() => items.find((i) => i.match(route.path, route.name))?.to ?? null);
</script>

<template>
  <nav class="nav" aria-label="Principal">
    <RouterLink to="/" class="nav__brand" aria-label="em dia, início">
      <Wordmark :size="30" />
    </RouterLink>
    <ul class="nav__list">
      <li v-for="item in items" :key="item.to">
        <RouterLink
          :to="item.to"
          class="nav__item"
          :class="{ 'is-active': active === item.to }"
          :aria-current="active === item.to ? 'page' : undefined"
        >
          <Icon :name="item.icon" :size="22" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>
    <div v-if="auth.user" class="nav__who">
      <span class="label">{{ auth.isEmployer ? "contratante" : "profissional" }}</span>
      <span class="nav__name">{{ auth.user.name }}</span>
    </div>
  </nav>
</template>

<style scoped>
.nav {
  position: fixed;
  z-index: 30;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--sheet);
  border-top: 1px solid var(--ink);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

.nav__brand,
.nav__who {
  display: none;
}

.nav__list {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  height: var(--nav-h);
}

.nav__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 100%;
  color: var(--ink-2);
  text-decoration: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: color var(--d-fast) var(--ease);
}

.nav__item:hover {
  color: var(--ink);
}

.nav__item.is-active {
  color: var(--ink);
}

.nav__item.is-active::before {
  content: "";
  position: absolute;
  top: -1px;
  left: 28%;
  right: 28%;
  height: 3px;
  background: var(--blue);
}

.nav__item:focus-visible {
  outline-offset: -4px;
}

@media (min-width: 960px) {
  .nav {
    top: 0;
    right: auto;
    width: var(--rail-w);
    display: flex;
    flex-direction: column;
    gap: var(--s-7);
    padding: var(--s-7) var(--s-4) var(--s-6);
    border-top: 0;
    border-right: 1px solid var(--rule);
    background: var(--paper);
  }

  .nav__brand {
    display: inline-block;
    padding: 0 var(--s-3);
    text-decoration: none;
  }

  .nav__list {
    display: grid;
    grid-template-columns: none;
    height: auto;
    gap: 2px;
  }

  .nav__item {
    flex-direction: row;
    justify-content: flex-start;
    gap: var(--s-3);
    height: 44px;
    padding: 0 var(--s-3);
    font-size: var(--t-16);
    font-weight: 500;
    border-radius: var(--r-1);
  }

  .nav__item:hover {
    background: var(--sheet);
  }

  .nav__item.is-active {
    background: var(--sheet);
    font-weight: 700;
    box-shadow: inset 0 0 0 1px var(--rule);
  }

  .nav__item.is-active::before {
    top: 10px;
    bottom: 10px;
    left: 0;
    right: auto;
    width: 3px;
    height: auto;
  }

  .nav__who {
    display: grid;
    gap: 2px;
    margin-top: auto;
    padding: var(--s-4) var(--s-3) 0;
    border-top: 1px dashed var(--rule);
  }

  .nav__name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
