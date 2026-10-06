<script setup lang="ts">
import { loginSchema } from "@ponto/shared";
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AuthHeader from "@/components/layout/AuthHeader.vue";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import PasswordInput from "@/components/ui/PasswordInput.vue";
import { useForm } from "@/composables/form.ts";
import { safeNext } from "@/router/guard.ts";
import { useAuthStore } from "@/stores/auth.ts";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const next = computed(() => safeNext(route.query.next));
const { values, errors, formError, submitting, submit, clearError } = useForm(loginSchema, {
  email: "",
  password: "",
});

function onSubmit(): void {
  void submit(async (data) => {
    await auth.login(data);
    await router.replace(next.value ?? "/");
  });
}
</script>

<template>
  <AuthHeader title="entrar" lede="Que bom te ver de novo." />
  <form class="stack" novalidate @submit.prevent="onSubmit">
    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
    <Field v-slot="{ id, invalid, describedBy }" label="E-mail" :error="errors.email">
      <input
        :id="id"
        v-model="values.email"
        class="input"
        type="email"
        inputmode="email"
        autocomplete="email"
        autocapitalize="off"
        spellcheck="false"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedBy"
        @input="clearError('email')"
      />
    </Field>
    <Field
      v-slot="{ id, invalid, describedBy }"
      label="Senha"
      :error="errors.password ? 'Informe sua senha' : null"
    >
      <PasswordInput
        :id="id"
        v-model="values.password"
        :invalid="invalid"
        :described-by="describedBy"
        @update:model-value="clearError('password')"
      />
    </Field>
    <div class="login__forgot">
      <RouterLink to="/esqueci-senha" class="link-btn">esqueci minha senha</RouterLink>
    </div>
    <Button type="submit" variant="primary" block :loading="submitting">entrar</Button>
    <p class="login__alt">
      Ainda não tem conta?
      <RouterLink :to="{ path: '/criar-conta', query: next ? { next } : {} }"
        >criar conta</RouterLink
      >
    </p>
  </form>
</template>

<style scoped>
.login__forgot {
  margin-top: calc(var(--s-3) * -1);
}

.login__alt {
  color: var(--ink-2);
  text-align: center;
  font-size: var(--t-14);
}
</style>
