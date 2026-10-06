<script setup lang="ts">
import { ICON_PATHS, type IconName } from "./icons.ts";

const { name, size = 20 } = defineProps<{ name: IconName; size?: number; label?: string }>();
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <path :d="ICON_PATHS[name]" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
}
</style>
