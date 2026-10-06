<script setup lang="ts">
const { w = "100%", h = "16px", gap } = defineProps<{ w?: string; h?: string; gap?: string }>();
</script>

<template>
  <span class="skeleton" :style="{ width: w, height: h, marginTop: gap }" aria-hidden="true" />
</template>
