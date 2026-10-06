<script setup lang="ts">
const { size = 28 } = defineProps<{ size?: number }>();
</script>

<template>
  <span class="wordmark" :style="{ fontSize: `${size}px` }" aria-label="ponto.">
    <span aria-hidden="true">ponto</span><span class="wordmark__dot" aria-hidden="true">.</span>
  </span>
</template>

<style scoped>
.wordmark {
  font-weight: 800;
  font-variation-settings: "opsz" 96;
  letter-spacing: -0.05em;
  line-height: 1;
  color: var(--ink);
  white-space: nowrap;
}

.wordmark__dot {
  color: var(--red);
}
</style>
