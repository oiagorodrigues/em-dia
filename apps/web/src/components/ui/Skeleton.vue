<script setup lang="ts">
const {
  w = "100%",
  h = "16px",
  gap,
  round = false,
} = defineProps<{ w?: string; h?: string; gap?: string; round?: boolean }>();
</script>

<template>
  <span
    class="skeleton"
    :class="{ 'is-round': round }"
    :style="{ width: w, height: h, marginTop: gap }"
    aria-hidden="true"
  />
</template>

<style scoped>
.skeleton.is-round {
  flex: none;
  border-radius: 50%;
}
</style>
