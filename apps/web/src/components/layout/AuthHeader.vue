<script setup lang="ts">
const { title, lede } = defineProps<{ title: string; lede?: string }>();
</script>

<template>
  <header class="ah">
    <h1 class="ah__title display">{{ title }}</h1>
    <p v-if="lede" class="ah__lede">{{ lede }}</p>
  </header>
</template>

<style scoped>
.ah {
  margin-bottom: var(--s-7);
}

.ah__title {
  font-size: var(--t-40);
}

.ah__lede {
  margin-top: var(--s-3);
  color: var(--ink-2);
}
</style>
