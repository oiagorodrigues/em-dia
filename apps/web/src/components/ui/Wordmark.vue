<script setup lang="ts">
const { size = 28 } = defineProps<{ size?: number }>();
</script>

<template>
  <span class="wordmark" :style="{ fontSize: `${size}px` }" role="img" aria-label="em dia">
    <span aria-hidden="true">em dia</span><span class="wordmark__dot" aria-hidden="true" />
  </span>
</template>

<style scoped>
.wordmark {
  display: inline-flex;
  align-items: baseline;
  font-weight: 800;
  font-variation-settings: "opsz" 96;
  letter-spacing: -0.05em;
  line-height: 1;
  color: var(--ink);
  white-space: nowrap;
}

/* The period is a round red mark, drawn rather than typed so it reads as the stamp, not punctuation. */
.wordmark__dot {
  display: inline-block;
  width: 0.24em;
  height: 0.24em;
  margin-left: 0.07em;
  border-radius: 50%;
  background: var(--coral);
}
</style>
