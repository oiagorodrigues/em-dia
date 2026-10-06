<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { errorMessage } from "@/api";
import Avatar from "@/components/ui/Avatar.vue";
import Menu from "@/components/ui/Menu.vue";
import type { MenuItem } from "@/components/ui/menu.ts";
import Wordmark from "@/components/ui/Wordmark.vue";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();

const menu = computed<MenuItem[]>(() => [
  { label: "Perfil", icon: "user", onSelect: () => void router.push("/perfil") },
  {
    label: "Sair",
    icon: "logout",
    onSelect: async () => {
      try {
        await auth.logout();
        await router.replace("/entrar");
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
  },
]);
</script>

<template>
  <header class="tb">
    <RouterLink to="/" class="tb__brand" aria-label="em dia, início"
      ><Wordmark :size="24"
    /></RouterLink>
    <div v-if="auth.user" class="tb__account">
      <Avatar :name="auth.user.name" :size="32" />
      <Menu :items="menu" label="Conta" icon="chevron-down" />
    </div>
  </header>
</template>

<style scoped>
.tb {
  position: sticky;
  top: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: calc(var(--topbar-h) + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) var(--gutter) 0;
  background: var(--sidebar);
  color: var(--sidebar-ink);
}

@media (min-width: 960px) {
  .tb {
    display: none;
  }
}

.tb__brand {
  text-decoration: none;
}

.tb__brand :deep(.wordmark) {
  color: var(--sidebar-ink);
}

.tb__account {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tb__account :deep(.menu__trigger) {
  color: var(--sidebar-ink);
}
</style>
