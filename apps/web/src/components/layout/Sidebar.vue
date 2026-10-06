<script setup lang="ts">
import { ROLE_LABEL } from "@emdia/shared";
import { computed, ref, useTemplateRef } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { errorMessage } from "@/api";
import Avatar from "@/components/ui/Avatar.vue";
import Icon from "@/components/ui/Icon.vue";
import Wordmark from "@/components/ui/Wordmark.vue";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import { useSlidingIndicator } from "@/lib/motion.ts";
import { navItems } from "./nav.ts";

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();

const items = computed(() => navItems(auth.role));
const active = computed(() => items.value.find((i) => i.match(route))?.to ?? null);
const list = useTemplateRef<HTMLElement>("list");
const indicator = useSlidingIndicator(list, ".is-active", "y", () => active.value);

const leaving = ref(false);
async function logout(): Promise<void> {
  leaving.value = true;
  try {
    await auth.logout();
    await router.replace("/entrar");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    leaving.value = false;
  }
}
</script>

<template>
  <aside class="side" aria-label="Menu lateral">
    <RouterLink to="/" class="side__brand" aria-label="em dia, início">
      <Wordmark :size="30" />
    </RouterLink>
    <nav aria-label="Principal">
      <ul ref="list" class="side__list">
        <li class="side__indicator" aria-hidden="true" :style="indicator" />
        <li v-for="item in items" :key="item.to">
          <RouterLink
            :to="item.to"
            class="side__item"
            :class="{ 'is-active': active === item.to }"
            :aria-current="active === item.to ? 'page' : undefined"
          >
            <Icon :name="item.icon" :size="22" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>
    <div v-if="auth.user" class="side__user">
      <RouterLink to="/perfil" class="side__who">
        <Avatar :name="auth.user.name" :size="40" />
        <span class="side__who-text">
          <span class="side__name">{{ auth.user.name }}</span>
          <span class="side__role">{{ ROLE_LABEL[auth.user.role] }}</span>
        </span>
      </RouterLink>
      <button type="button" class="side__logout" :disabled="leaving" @click="logout">
        <Icon name="logout" :size="18" />
        <span>Sair</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.side {
  position: fixed;
  z-index: 30;
  inset: 0 auto 0 0;
  width: var(--sidebar-w);
  display: none;
  flex-direction: column;
  gap: var(--s-7);
  padding: var(--s-7) var(--s-4) var(--s-5);
  background: var(--sidebar);
  color: var(--sidebar-ink);
}

@media (min-width: 960px) {
  .side {
    display: flex;
  }
}

.side__brand {
  display: inline-block;
  padding: 0 var(--s-3);
  text-decoration: none;
}

.side__brand :deep(.wordmark) {
  color: var(--sidebar-ink);
}

.side__list {
  position: relative;
  list-style: none;
  padding: 0;
  display: grid;
  gap: 4px;
}

.side__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 44px;
  padding: 0 var(--s-3);
  border-radius: var(--r-1);
  color: var(--sidebar-ink);
  text-decoration: none;
  font-size: var(--t-16);
  font-weight: 500;
  transition: background-color var(--d-fast) var(--ease);
}

.side__item:hover {
  background: color-mix(in srgb, var(--sidebar-active) 55%, transparent);
}

.side__item.is-active {
  font-weight: 700;
}

.side__item.is-active:hover {
  background: transparent;
}

.side__user {
  margin-top: auto;
  display: grid;
  gap: var(--s-2);
  padding: var(--s-3);
  border-radius: var(--r-2);
  background: color-mix(in srgb, var(--sidebar-active) 60%, transparent);
}

.side__who {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
  color: var(--sidebar-ink);
  text-decoration: none;
}

.side__who-text {
  display: grid;
  min-width: 0;
}

.side__name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side__role {
  font-size: var(--t-12);
  opacity: 0.8;
}

.side__logout {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 40px;
  padding: 0 var(--s-2);
  border-radius: var(--r-1);
  color: var(--sidebar-ink);
  font-weight: 600;
  font-size: var(--t-14);
}

.side__logout:hover:not(:disabled) {
  background: var(--sidebar-active);
}

/* One white pill with a green bar that slides between items. */
.side__indicator {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  border-radius: var(--r-1);
  background: var(--sidebar-active);
  box-shadow: var(--shadow-1);
  pointer-events: none;
  transition:
    transform var(--d-sheet) var(--ease-out),
    height var(--d-sheet) var(--ease-out),
    opacity var(--d-fast) var(--ease-out);
}

.side__indicator::before {
  content: "";
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--brand);
}

.side__item {
  z-index: 1;
}

@media (prefers-reduced-motion: reduce) {
  .side__indicator {
    transition: opacity var(--d-fast) linear;
  }
}
</style>
