<script setup lang="ts">
const { size = "md" } = defineProps<{ size?: "sm" | "md" }>();
</script>

<template>
  <span class="beta" :class="`beta--${size}`">Beta</span>
</template>

<style scoped>
.beta {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--amber-ink) 35%, transparent);
  border-radius: 999px;
  background: var(--amber-wash);
  color: var(--amber-ink);
  font-size: var(--t-12);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.2;
  white-space: nowrap;
}

.beta--sm {
  padding: 1px 6px;
  font-size: 10px;
}
</style>
