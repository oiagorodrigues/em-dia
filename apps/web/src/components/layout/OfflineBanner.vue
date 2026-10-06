<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
import { useOnline } from "@/composables/online.ts";

const online = useOnline();
</script>

<template>
  <Transition name="offline">
    <div v-if="!online" class="offline" role="status">
      <Icon name="wifi-off" :size="16" />
      <span>Você está sem internet. O que aparece aqui pode estar desatualizado.</span>
    </div>
  </Transition>
</template>

<style scoped>
.offline {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  padding: calc(var(--s-2) + env(safe-area-inset-top)) var(--gutter) var(--s-2);
  background: var(--ink);
  color: var(--sheet);
  font-size: var(--t-12);
  font-weight: 500;
  text-align: center;
}

@media (min-width: 960px) {
  :global(.layout-app .offline) {
    margin-left: var(--rail-w);
  }
}

.offline-enter-active,
.offline-leave-active {
  transition: opacity var(--d-base) var(--ease);
}
.offline-enter-from,
.offline-leave-to {
  opacity: 0;
}
</style>
