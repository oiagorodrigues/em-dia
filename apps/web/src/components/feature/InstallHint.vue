<script setup lang="ts">
import { RouterLink } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import { useInstallPrompt } from "@/composables/install.ts";

const { showHint, canPrompt, install, dismissHint } = useInstallPrompt();

async function onInstall(): Promise<void> {
  await install();
  dismissHint();
}
</script>

<template>
  <aside v-if="showHint" class="hint" aria-label="Instalar o app">
    <Icon name="install" :size="18" />
    <p class="hint__text">Coloque o <strong>em dia</strong> na tela inicial e abra como app.</p>
    <button v-if="canPrompt" type="button" class="hint__go" @click="onInstall">Instalar</button>
    <RouterLink v-else to="/perfil#instalar" class="hint__go" @click="dismissHint"
      >Como?</RouterLink
    >
    <button type="button" class="hint__x" aria-label="Dispensar dica" @click="dismissHint">
      <Icon name="close" :size="16" />
    </button>
  </aside>
</template>

<style scoped>
.hint {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-1) var(--s-1) var(--s-1) var(--s-4);
  border: 1px dashed var(--ink-3);
  border-radius: var(--r-1);
  font-size: var(--t-14);
  color: var(--ink-2);
}

.hint__text {
  flex: 1;
  line-height: 1.35;
}

.hint__text strong {
  color: var(--ink);
}

.hint__go {
  min-height: 40px;
  padding: 0 var(--s-3);
  display: inline-flex;
  align-items: center;
  font-weight: 700;
  color: var(--brand);
  text-decoration: none;
  border-radius: var(--r-1);
}

.hint__go:hover {
  background: var(--brand-wash);
}

.hint__x {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--ink-3);
  border-radius: var(--r-1);
}

.hint__x:hover {
  color: var(--ink);
}
</style>
