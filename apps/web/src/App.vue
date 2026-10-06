<script setup lang="ts">
import { computed, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppShell from "@/components/layout/AppShell.vue";
import AuthLayout from "@/components/layout/AuthLayout.vue";
import OfflineBanner from "@/components/layout/OfflineBanner.vue";
import ToastHost from "@/components/feature/ToastHost.vue";
import { useServiceWorker } from "@/composables/sw.ts";

const route = useRoute();
const layout = computed(() => route.meta.layout ?? "app");

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
  <OfflineBanner />
  <AuthLayout v-if="layout === 'auth'">
    <RouterView />
  </AuthLayout>
  <AppShell v-else-if="layout === 'app'">
    <RouterView />
  </AppShell>
  <main v-else id="conteudo"><RouterView /></main>
  <ToastHost />
</template>
