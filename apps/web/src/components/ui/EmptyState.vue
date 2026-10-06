<script setup lang="ts">
const { title, tone = "neutral" } = defineProps<{ title: string; tone?: "neutral" | "error" }>();
</script>

<template>
  <div class="empty" :class="`empty--${tone}`" :role="tone === 'error' ? 'alert' : undefined">
    <div class="empty__mark" aria-hidden="true">
      <slot name="mark"><span class="empty__dot" /></slot>
    </div>
    <p class="empty__title">{{ title }}</p>
    <div v-if="$slots.default" class="empty__body"><slot /></div>
    <div v-if="$slots.actions" class="empty__actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.empty {
  display: grid;
  justify-items: center;
  gap: var(--s-3);
  padding: var(--s-8) var(--s-5);
  text-align: center;
  border: 1px dashed var(--rule);
  border-radius: var(--r-2);
}

.empty__mark {
  color: var(--ink-3);
}

.empty__dot {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--coral);
}

.empty--neutral .empty__dot {
  background: none;
  border: 2px dotted var(--ink-3);
}

.empty__title {
  font-weight: 700;
  font-size: var(--t-20);
  letter-spacing: -0.02em;
  max-width: 28ch;
}

.empty__body {
  color: var(--ink-2);
  max-width: 40ch;
  font-size: var(--t-14);
}

.empty__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-3);
  margin-top: var(--s-2);
}
</style>
