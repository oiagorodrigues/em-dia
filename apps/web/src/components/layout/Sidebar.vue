<script setup lang="ts">
import { ROLE_LABEL } from "@emdia/shared";
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { errorMessage } from "@/api";
import Avatar from "@/components/ui/Avatar.vue";
import Icon from "@/components/ui/Icon.vue";
import BetaTag from "@/components/ui/BetaTag.vue";
import { ACTION_ICON } from "@/components/ui/icons.ts";
import Mark from "@/components/ui/Mark.vue";
import Tooltip from "@/components/ui/Tooltip.vue";
import Wordmark from "@/components/ui/Wordmark.vue";
import { useSidebarCollapse } from "@/composables/sidebar.ts";
import { useFeedbackSheet } from "@/composables/feedback.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import { useSlidingIndicator } from "@/lib/motion.ts";
import { navItems } from "./nav.ts";

const auth = useAuthStore();
const feedback = useFeedbackSheet();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();

const { collapsed, toggle } = useSidebarCollapse();
const toggleLabel = computed(() => (collapsed.value ? "Expandir menu" : "Recolher menu"));
const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘B" : "Ctrl+B";

/** ⌘B / Ctrl+B toggles the menu, except while typing, where it may mean bold. */
function onKey(e: KeyboardEvent): void {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b") return;
  const el = e.target;
  if (el instanceof Element && el.closest("input, textarea, select, [contenteditable='true']"))
    return;
  e.preventDefault();
  toggle();
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

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
  <aside
    id="menu-lateral"
    class="side"
    :class="{ 'is-collapsed': collapsed }"
    aria-label="Menu lateral"
  >
    <div class="side__head">
      <RouterLink to="/" class="side__brand" aria-label="em dia, versão beta, início">
        <Mark v-if="collapsed" :size="26" />
        <Wordmark v-else :size="30" />
        <BetaTag :size="collapsed ? 'sm' : 'md'" />
      </RouterLink>
      <Tooltip :text="`${toggleLabel} (${shortcut})`" :side="collapsed ? 'right' : 'bottom'">
        <button
          type="button"
          class="side__toggle"
          :aria-label="toggleLabel"
          :aria-expanded="!collapsed"
          aria-controls="menu-lateral"
          :aria-keyshortcuts="shortcut === '⌘B' ? 'Meta+B' : 'Control+B'"
          @click="toggle"
        >
          <Icon :name="collapsed ? 'sidebar-expand' : 'sidebar-collapse'" :size="20" />
        </button>
      </Tooltip>
    </div>
    <nav aria-label="Principal">
      <ul ref="list" class="side__list">
        <li class="side__indicator" aria-hidden="true" :style="indicator" />
        <li v-for="item in items" :key="item.to">
          <Tooltip :text="item.label" side="right" :disabled="!collapsed">
            <RouterLink
              :to="item.to"
              class="side__item"
              :class="{ 'is-active': active === item.to }"
              :aria-current="active === item.to ? 'page' : undefined"
            >
              <Icon :name="item.icon" :size="22" />
              <span class="side__label">{{ item.label }}</span>
            </RouterLink>
          </Tooltip>
        </li>
      </ul>
    </nav>
    <div class="side__foot">
      <Tooltip text="Enviar feedback" side="right" :disabled="!collapsed">
        <button type="button" class="side__item" @click="feedback.show">
          <Icon :name="ACTION_ICON.feedback" :size="22" />
          <span class="side__label">Enviar feedback</span>
        </button>
      </Tooltip>
      <div v-if="auth.user" class="side__user">
        <Tooltip :text="auth.user.name" side="right" :disabled="!collapsed">
          <RouterLink to="/perfil" class="side__who">
            <Avatar :name="auth.user.name" :size="collapsed ? 36 : 40" />
            <span class="side__who-text side__label">
              <span class="side__name">{{ auth.user.name }}</span>
              <span class="side__role">{{ ROLE_LABEL[auth.user.role] }}</span>
            </span>
          </RouterLink>
        </Tooltip>
        <Tooltip text="Sair" side="right" :disabled="!collapsed">
          <button type="button" class="side__logout" :disabled="leaving" @click="logout">
            <Icon name="logout" :size="18" />
            <span class="side__label">Sair</span>
          </button>
        </Tooltip>
      </div>
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
  overflow-x: hidden;
  background: var(--sidebar);
  color: var(--sidebar-ink);
}

html[data-sidebar-moving] .side {
  transition: width var(--d-sheet) var(--ease-out);
}

@media (min-width: 960px) {
  .side {
    display: flex;
  }
}

.side__brand {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 32px;
  padding: 0 var(--s-3);
  text-decoration: none;
  color: var(--sidebar-ink);
}

.side__brand :deep(.wordmark),
.side__brand :deep(.mark) {
  color: var(--sidebar-ink);
}

.side :deep(.tip-anchor) {
  display: flex;
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
  flex: 1;
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
  white-space: nowrap;
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

.side__foot {
  margin-top: auto;
  display: grid;
  gap: var(--s-3);
}

/* The toggle sits beside the logo, not inside its link, so it can't be hit for "início". */
.side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
}

.side__toggle {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--sidebar-ink);
  opacity: 0.7;
  cursor: pointer;
}

.side__toggle:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--sidebar-ink) 8%, transparent);
}

.side__toggle:focus-visible,
.side__item:focus-visible,
.side__who:focus-visible,
.side__logout:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.side__user {
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
  flex: 1;
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

/* Icons only: labels stay in the DOM, visually hidden, so links keep their accessible names. */
.is-collapsed .side__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.is-collapsed .side__head {
  flex-direction: column;
  gap: var(--s-3);
}

.is-collapsed .side__brand {
  flex-direction: column;
  justify-content: center;
  gap: var(--s-1);
  padding: 0;
}

.is-collapsed .side__item,
.is-collapsed .side__logout {
  justify-content: center;
  padding: 0;
}

.is-collapsed .side__user {
  justify-items: center;
  padding: var(--s-2) 0;
}

.is-collapsed .side__who {
  justify-content: center;
}

@media (prefers-reduced-motion: reduce) {
  html[data-sidebar-moving] .side {
    transition: none;
  }
  .side__indicator {
    transition: opacity var(--d-fast) linear;
  }
}
</style>
