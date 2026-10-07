<script setup lang="ts">
import BottomBar from "./BottomBar.vue";
import Sidebar from "./Sidebar.vue";
import TopBar from "./TopBar.vue";
</script>

<template>
  <div class="shell">
    <a href="#conteudo" class="skip">Pular para o conteúdo</a>
    <Sidebar />
    <div class="shell__body">
      <TopBar />
      <main id="conteudo" class="shell__main" tabindex="-1">
        <slot />
      </main>
    </div>
    <BottomBar />
  </div>
</template>

<style scoped>
.shell__main {
  width: 100%;
  max-width: calc(var(--content) + 2 * var(--gutter));
  margin: 0 auto;
  padding: var(--s-6) var(--gutter) calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--s-9));
  outline: none;
}

@media (min-width: 960px) {
  .shell__body {
    padding-left: var(--sidebar-w);
  }
  html[data-sidebar-moving] .shell__body {
    transition: padding-left var(--d-sheet) var(--ease-out);
  }
  .shell__main {
    padding-top: var(--s-8);
    padding-bottom: var(--s-10);
  }
}

@media (prefers-reduced-motion: reduce) {
  html[data-sidebar-moving] .shell__body {
    transition: none;
  }
}

.skip {
  position: absolute;
  z-index: 60;
  left: var(--s-3);
  top: -60px;
  padding: var(--s-3) var(--s-4);
  background: var(--ink);
  color: var(--surface);
  border-radius: var(--r-1);
}

.skip:focus {
  top: var(--s-3);
}
</style>
