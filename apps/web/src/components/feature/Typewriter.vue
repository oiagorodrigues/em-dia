<script setup lang="ts">
const { text } = defineProps<{ text: string }>();
</script>

<template>
  <span class="tw" :style="{ '--n': text.length }">{{ text }}</span>
</template>

<style scoped>
.tw {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  vertical-align: bottom;
  animation: type calc(var(--n) * 70ms) steps(var(--n), end) 120ms both;
}

@keyframes type {
  from {
    width: 0;
  }
  to {
    width: calc(var(--n) * 1ch);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tw {
    animation: none;
  }
}
</style>
