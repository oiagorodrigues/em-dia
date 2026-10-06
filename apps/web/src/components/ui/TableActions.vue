<script setup lang="ts">
import { computed } from "vue";
import IconButton from "./IconButton.vue";
import Menu from "./Menu.vue";
import { layoutActions, type InlineAction, type MenuItem } from "./menu.ts";

const {
  actions = [],
  menu = [],
  menuLabel = "Mais ações",
  maxInline = 2,
} = defineProps<{
  /** Most frequent first; at most `maxInline` stay inline, the rest move into the menu. */
  actions?: readonly InlineAction[];
  menu?: readonly MenuItem[];
  menuLabel?: string;
  maxInline?: number;
}>();

const layout = computed(() => layoutActions(actions, menu, maxInline));
</script>

<template>
  <div class="ta" @click.stop @keydown.enter.stop>
    <IconButton
      v-for="a in layout.inline"
      :key="a.label"
      :icon="a.icon"
      :label="a.label"
      :tone="a.tone ?? 'neutral'"
      :to="a.to"
      :loading="a.loading"
      :disabled="a.disabled"
      @click="a.onClick?.()"
    />
    <Menu v-if="layout.menu.length" :items="layout.menu" :label="menuLabel" />
  </div>
</template>

<style scoped>
.ta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
</style>
