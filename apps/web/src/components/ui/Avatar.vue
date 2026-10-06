<script setup lang="ts">
import { computed } from "vue";
import { initialsOf, tintFor } from "@/lib/tint.ts";

const { name, size = 40 } = defineProps<{ name: string; size?: number }>();

const tint = computed(() => tintFor(name));
const initials = computed(() => initialsOf(name));
</script>

<template>
  <span
    class="avatar"
    :class="`tint-${tint}`"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }"
    aria-hidden="true"
    >{{ initials }}</span
  >
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  user-select: none;
}
</style>
