<script setup lang="ts">
import Skeleton from "./Skeleton.vue";

/** Placeholder with the box, rows and line heights of `KpiCard`, for before its label is known. */
const { projected = false, caption = true } = defineProps<{
  projected?: boolean;
  caption?: boolean;
}>();
</script>

<template>
  <div class="skpi" :class="{ 'is-projected': projected }" aria-hidden="true">
    <p class="skpi__label">
      <Skeleton w="28px" h="28px" />
      <Skeleton w="45%" h="12px" />
    </p>
    <p class="skpi__value"><Skeleton w="60%" h="1.15em" /></p>
    <p v-if="caption" class="skpi__caption"><Skeleton w="40%" h="12px" /></p>
  </div>
</template>

<style scoped>
.skpi {
  container-type: inline-size;
  display: grid;
  align-content: start;
  gap: var(--s-2);
  min-width: 0;
  padding: var(--s-4) var(--s-5) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  box-shadow: var(--shadow-1);
}

.skpi.is-projected {
  border-style: dashed;
  border-color: var(--ink-3);
  box-shadow: none;
}

.skpi__label {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.skpi__value {
  font-size: clamp(var(--t-20), 11cqi, var(--t-28));
  line-height: 1.15;
}

.skpi__caption {
  display: flex;
  align-items: center;
  min-height: calc(var(--t-12) * 1.5);
}
</style>
