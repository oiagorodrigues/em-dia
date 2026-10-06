<script setup lang="ts">
import AppNav from "./AppNav.vue";
</script>

<template>
  <div class="shell">
    <a href="#conteudo" class="skip">Pular para o conteúdo</a>
    <AppNav />
    <main id="conteudo" class="shell__main" tabindex="-1">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell__main {
  width: 100%;
  max-width: calc(var(--content) + 2 * var(--gutter));
  margin: 0 auto;
  padding: calc(var(--s-5) + env(safe-area-inset-top))
    max(var(--gutter), env(safe-area-inset-right))
    calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--s-9))
    max(var(--gutter), env(safe-area-inset-left));
  outline: none;
}

@media (min-width: 960px) {
  .shell {
    padding-left: var(--rail-w);
  }
  .shell__main {
    max-width: calc(var(--content) + 2 * var(--s-7));
    padding: var(--s-8) var(--s-7) var(--s-10);
  }
}

.skip {
  position: absolute;
  z-index: 60;
  left: var(--s-3);
  top: -60px;
  padding: var(--s-3) var(--s-4);
  background: var(--ink);
  color: var(--sheet);
  border-radius: var(--r-1);
}

.skip:focus {
  top: var(--s-3);
}
</style>
