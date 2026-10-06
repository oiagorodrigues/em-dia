<script setup lang="ts">
import { resetPasswordSchema } from "@ponto/shared";
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { authApi } from "@/api";
import AuthHeader from "@/components/layout/AuthHeader.vue";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import PasswordInput from "@/components/ui/PasswordInput.vue";
import { useForm } from "@/composables/form.ts";

const route = useRoute();
const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
const done = ref(false);

const { values, errors, formError, submitting, submit, clearError } = useForm(resetPasswordSchema, {
  token: "",
  password: "",
});

function onSubmit(): void {
  void submit(
    async (data) => {
      await authApi.resetPassword(data.token, data.password);
      done.value = true;
    },
    { token: token.value, password: values.password },
  );
}
</script>

<template>
  <template v-if="!token">
    <AuthHeader
      title="link incompleto"
      lede="Esse link de nova senha não tem o código. Peça outro."
    />
    <Button to="/esqueci-senha" variant="primary" block>pedir novo link</Button>
  </template>
  <template v-else-if="done">
    <AuthHeader
      title="senha nova salva"
      lede="Por segurança, saímos de todos os aparelhos. Entre com a senha nova."
    />
    <Button to="/entrar" variant="primary" block>entrar</Button>
  </template>
  <template v-else>
    <AuthHeader title="nova senha" lede="Escolha uma senha que você não usa em outro lugar." />
    <form class="stack" novalidate @submit.prevent="onSubmit">
      <p v-if="formError || errors.token" class="form-error" role="alert">
        {{ formError ?? "Link inválido ou expirado." }}
        <RouterLink v-if="errors.token || formError" to="/esqueci-senha">pedir outro</RouterLink>
      </p>
      <Field
        v-slot="{ id, invalid, describedBy }"
        label="Senha nova"
        :error="errors.password"
        hint="Pelo menos 10 caracteres, com letras e números."
      >
        <PasswordInput
          :id="id"
          v-model="values.password"
          autocomplete="new-password"
          :invalid="invalid"
          :described-by="describedBy"
          @update:model-value="clearError('password')"
        />
      </Field>
      <Button type="submit" variant="primary" block :loading="submitting">salvar senha</Button>
    </form>
  </template>
</template>
