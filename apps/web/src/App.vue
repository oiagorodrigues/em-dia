<script setup lang="ts">
import { computed, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { Analytics } from "@vercel/analytics/vue";
import AppShell from "@/components/layout/AppShell.vue";
import AuthLayout from "@/components/layout/AuthLayout.vue";
import OfflineBanner from "@/components/layout/OfflineBanner.vue";
import ToastHost from "@/components/feature/ToastHost.vue";
import { useServiceWorker } from "@/composables/sw.ts";

const route = useRoute();
const layout = computed(() => route.meta.layout ?? "app");
/*
 * Animate between pages, not between tabs of one page: keyed by the top-level route record,
 * so /equipe/:id → /equipe/:id/pagamentos keeps the page (its tabs cross-fade on their own).
 */
const pageKey = computed(() => route.matched[0]?.path ?? route.path);

useServiceWorker();

watch(
  layout,
  (l) => {
    document.body.className = `layout-${l}`;
  },
  { immediate: true },
);
</script>

<template>
  <Analytics />
  <OfflineBanner />
  <AuthLayout v-if="layout === 'auth'">
    <RouterView v-slot="{ Component }">
      <Transition name="route" mode="out-in">
        <!-- The wrapper gives <Transition> one element even when a view renders a fragment. -->
        <div :key="pageKey" class="route-page"><component :is="Component" /></div>
      </Transition>
    </RouterView>
  </AuthLayout>
  <AppShell v-else-if="layout === 'app'">
    <RouterView v-slot="{ Component }">
      <Transition name="route" mode="out-in">
        <!-- The wrapper gives <Transition> one element even when a view renders a fragment. -->
        <div :key="pageKey" class="route-page"><component :is="Component" /></div>
      </Transition>
    </RouterView>
  </AppShell>
  <main v-else id="conteudo"><RouterView /></main>
  <ToastHost />
</template>
