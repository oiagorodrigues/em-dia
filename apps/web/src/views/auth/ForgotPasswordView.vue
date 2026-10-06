<script setup lang="ts">
import { forgotPasswordSchema } from "@emdia/shared";
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { authApi } from "@/api";
import AuthHeader from "@/components/layout/AuthHeader.vue";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import { useForm } from "@/composables/form.ts";

const sent = ref(false);
const { values, errors, formError, submitting, submit, clearError } = useForm(
  forgotPasswordSchema,
  { email: "" },
);

function onSubmit(): void {
  void submit(async (data) => {
    await authApi.forgotPassword(data.email);
    sent.value = true;
  });
}
</script>

<template>
  <template v-if="sent">
    <AuthHeader title="confira seu e-mail" />
    <div class="stack">
      <p>
        Se existir uma conta com <strong class="mono sent-email">{{ values.email }}</strong
        >, mandamos um link para criar uma senha nova. Ele vale por 30 minutos.
      </p>
      <p class="muted">Não chegou? Olhe a caixa de spam ou tente de novo em alguns minutos.</p>
      <Button to="/entrar" block>voltar para entrar</Button>
    </div>
  </template>
  <template v-else>
    <AuthHeader
      title="esqueci a senha"
      lede="Diga seu e-mail e mandamos um link para criar uma senha nova."
    />
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
      <Button type="submit" variant="primary" block :loading="submitting">enviar link</Button>
      <p class="alt"><RouterLink to="/entrar">voltar para entrar</RouterLink></p>
    </form>
  </template>
</template>

<style scoped>
.sent-email {
  font-size: 0.9em;
  color: var(--blue);
  word-break: break-all;
}

.alt {
  text-align: center;
  font-size: var(--t-14);
}
</style>
