<script setup lang="ts">
import { ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";
import { firstName } from "@/lib/format.ts";
import { useAuthStore } from "@/stores/auth.ts";

const {
  text = "Este convite é para a pessoa que trabalha com você criar a própria conta no app.",
} = defineProps<{
  text?: string;
}>();
const emit = defineEmits<{ "signed-out": [] }>();

const auth = useAuthStore();
const leaving = ref(false);

async function signOut(): Promise<void> {
  leaving.value = true;
  try {
    await auth.logout();
    emit("signed-out");
  } finally {
    leaving.value = false;
  }
}
</script>

<template>
  <section class="isn" role="status" aria-labelledby="isn-title">
    <span class="isn__icon" aria-hidden="true"><Icon name="key" :size="20" /></span>
    <div class="isn__text">
      <p id="isn-title" class="isn__title">
        Você está conectado como {{ firstName(auth.user?.name ?? "") }}.
      </p>
      <p class="isn__body">{{ text }}</p>
    </div>
    <div class="isn__actions">
      <Button variant="primary" :loading="leaving" @click="signOut">Sair e continuar</Button>
      <Button to="/" variant="ghost">Voltar ao app</Button>
    </div>
  </section>
</template>

<style scoped>
.isn {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--s-3) var(--s-4);
  padding: var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-3);
  box-shadow: var(--shadow-1);
}

.isn__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--amber-wash);
  color: var(--amber-ink);
}

.isn__text {
  display: grid;
  gap: var(--s-1);
}

.isn__title {
  font-weight: 700;
}

.isn__body {
  color: var(--ink-2);
}

.isn__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}
</style>
