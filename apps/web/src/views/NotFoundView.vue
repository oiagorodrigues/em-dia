<script setup lang="ts">
import Button from "@/components/ui/Button.vue";
import Stamp from "@/components/ui/Stamp.vue";
import Wordmark from "@/components/ui/Wordmark.vue";
import { useAuthStore } from "@/stores/auth.ts";

const auth = useAuthStore();
</script>

<template>
  <div class="nf">
    <Wordmark :size="28" />
    <div class="nf__card">
      <p class="nf__code mono" aria-hidden="true">404</p>
      <Stamp
        text="não encontrado"
        label="Página não encontrada"
        size="lg"
        class="nf__stamp"
        :tilt="-8"
      />
    </div>
    <h1 class="page-title">essa página faltou.</h1>
    <p class="muted">O endereço pode estar errado, ou a página saiu daqui.</p>
    <Button :to="auth.user ? '/' : '/entrar'" variant="primary" icon="arrow-left">
      {{ auth.user ? "voltar ao início" : "ir para entrar" }}
    </Button>
  </div>
</template>

<style scoped>
.nf {
  min-height: 100dvh;
  display: grid;
  align-content: center;
  justify-items: start;
  gap: var(--s-5);
  max-width: 520px;
  margin: 0 auto;
  padding: var(--s-8) var(--gutter);
}

.nf__card {
  position: relative;
  width: 100%;
  margin: var(--s-6) 0 var(--s-2);
  padding: var(--s-6) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
}

.nf__code {
  font-size: clamp(5rem, 28vw, 9rem);
  font-weight: 600;
  letter-spacing: -0.08em;
  line-height: 0.9;
  color: var(--ink-3);
}

.nf__stamp {
  position: absolute;
  right: var(--s-5);
  bottom: var(--s-6);
}
</style>
