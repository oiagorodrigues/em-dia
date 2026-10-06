<script setup lang="ts">
import { OCCUPATION_LABEL, type Contract } from "@ponto/shared";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { contractsApi, errorMessage, ApiError } from "@/api";
import CodeBoxes from "@/components/feature/CodeBoxes.vue";
import Button from "@/components/ui/Button.vue";
import Stamp from "@/components/ui/Stamp.vue";
import { INVITE_ALPHABET, INVITE_LENGTH, normalizeInviteCode } from "@/lib/invite.ts";

const route = useRoute();
const router = useRouter();

const code = ref(
  typeof route.query.convite === "string" ? normalizeInviteCode(route.query.convite) : "",
);
const error = ref<string | null>(null);
const submitting = ref(false);
const joined = ref<Contract | null>(null);

const complete = computed(() => code.value.replace(/\s/g, "").length === INVITE_LENGTH);

async function join(): Promise<void> {
  if (submitting.value) return;
  const clean = code.value.replace(/\s/g, "");
  if (clean.length !== INVITE_LENGTH) {
    error.value = "O código tem 8 letras e números.";
    return;
  }
  if ([...clean].some((c) => !INVITE_ALPHABET.includes(c))) {
    error.value = "Confira o código: ele não usa 0, 1, I, L nem O.";
    return;
  }
  error.value = null;
  submitting.value = true;
  try {
    joined.value = (await contractsApi.join(clean)).contract;
  } catch (e) {
    error.value =
      e instanceof ApiError && e.code === "NOT_FOUND"
        ? "Código inválido ou vencido. Peça um novo para quem te contratou."
        : errorMessage(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="join">
    <template v-if="joined">
      <Stamp text="vínculo ok" label="Vínculo confirmado" tone="green" size="lg" />
      <h1 class="page-title">pronto, {{ joined.employerName.split(" ")[0] }} já te vê aqui.</h1>
      <p class="muted">
        {{ OCCUPATION_LABEL[joined.occupation] }} em {{ joined.householdName }}. A partir de agora
        você bate o ponto pelo celular e acompanha seus pagamentos.
      </p>
      <Button variant="primary" icon="clock" @click="router.replace('/')">ir bater o ponto</Button>
    </template>
    <template v-else>
      <h1 class="page-title">entrar no vínculo</h1>
      <p class="muted">Digite o código de 8 caracteres que quem te contratou te passou.</p>
      <form class="join__form" novalidate @submit.prevent="join">
        <CodeBoxes
          v-model="code"
          :invalid="!!error"
          :described-by="error ? 'join-err' : undefined"
          @complete="join"
        />
        <p v-if="error" id="join-err" class="join__err" role="alert">{{ error }}</p>
        <Button type="submit" variant="primary" :disabled="!complete" :loading="submitting"
          >entrar</Button
        >
      </form>
    </template>
  </div>
</template>

<style scoped>
.join {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
  justify-items: start;
  max-width: 480px;
}

.join__form {
  display: grid;
  gap: var(--s-5);
  justify-items: start;
  width: 100%;
  margin-top: var(--s-3);
}

.join__err {
  color: var(--red-text);
  font-size: var(--t-14);
}
</style>
