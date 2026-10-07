<script setup lang="ts">
import Skeleton from "./Skeleton.vue";

/** The month switcher (arrows and the big month name) before its bounds are known. */
const { prefix = false } = defineProps<{ prefix?: boolean }>();
</script>

<template>
  <div class="sk-month" aria-hidden="true">
    <Skeleton w="44px" h="44px" />
    <span class="sk-month__label">
      <Skeleton v-if="prefix" w="72px" h="12px" />
      <Skeleton w="min(180px, 70%)" h="40px" />
    </span>
    <Skeleton w="44px" h="44px" />
  </div>
</template>

<style scoped>
.sk-month {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  gap: var(--s-2);
}

.sk-month__label {
  display: grid;
  justify-items: center;
  gap: 2px;
}
</style>
