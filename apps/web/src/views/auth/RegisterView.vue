<script setup lang="ts">
import { registerSchema, type Role } from "@emdia/shared";
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import InviteSignedInNotice from "@/components/feature/InviteSignedInNotice.vue";
import AuthHeader from "@/components/layout/AuthHeader.vue";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import PasswordInput from "@/components/ui/PasswordInput.vue";
import { useForm } from "@/composables/form.ts";
import { normalizeInviteCode } from "@/lib/invite.ts";
import { safeNext } from "@/router/guard.ts";
import { useAuthStore } from "@/stores/auth.ts";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const inviteFromLink =
  typeof route.query.convite === "string" ? normalizeInviteCode(route.query.convite) : "";

const { values, errors, formError, submitting, submit, clearError } = useForm(registerSchema, {
  name: "",
  email: "",
  password: "",
  role: (inviteFromLink ? "worker" : "employer") as Role,
  inviteCode: inviteFromLink,
});

const ROLE_CHOICES: { value: Role; title: string; text: string }[] = [
  {
    value: "employer",
    title: "Eu contrato",
    text: "Anoto os dias e os pagamentos de quem trabalha em casa.",
  },
  {
    value: "worker",
    title: "Eu trabalho",
    text: "Bato meu ponto e acompanho o que tenho a receber.",
  },
];

const isWorker = computed(() => values.role === "worker");
/** An invite link opened on a phone that is already signed in (usually the employer testing it). */
const signedInWithInvite = computed(() => !!auth.user && !!inviteFromLink);

function onSubmit(): void {
  const code = normalizeInviteCode(values.inviteCode ?? "");
  const input = { ...values, inviteCode: isWorker.value && code ? code : undefined };
  void submit(async (data) => {
    await auth.register(data);
    const next = safeNext(route.query.next);
    if (next) await router.replace(next);
    else if (data.role === "worker" && !data.inviteCode) await router.replace("/entrar-no-vinculo");
    else if (data.role === "employer") await router.replace("/equipe/novo");
    else await router.replace("/");
  }, input);
}
</script>

<template>
  <AuthHeader title="Criar conta" lede="Leva um minuto. Sem cartão de crédito, sem pegadinha." />
  <InviteSignedInNotice v-if="signedInWithInvite" />
  <form v-else class="stack" novalidate @submit.prevent="onSubmit">
    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

    <fieldset class="roles">
      <legend class="label">Você…</legend>
      <label
        v-for="choice in ROLE_CHOICES"
        :key="choice.value"
        class="role"
        :class="{ 'is-on': values.role === choice.value }"
      >
        <input
          v-model="values.role"
          class="visually-hidden"
          type="radio"
          name="role"
          :value="choice.value"
        />
        <span class="role__mark" aria-hidden="true" />
        <span class="role__title">{{ choice.title }}</span>
        <span class="role__text">{{ choice.text }}</span>
      </label>
    </fieldset>

    <Field v-slot="{ id, invalid, describedBy }" label="Seu nome" :error="errors.name">
      <input
        :id="id"
        v-model="values.name"
        class="input"
        type="text"
        autocomplete="name"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedBy"
        @input="clearError('name')"
      />
    </Field>
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
    <Field
      v-if="isWorker"
      v-slot="{ id, invalid, describedBy }"
      label="Código de convite"
      optional
      :error="errors.inviteCode ? 'O código tem 8 letras e números' : null"
      hint="Quem te contratou pode te passar. Dá para colocar depois também."
    >
      <input
        :id="id"
        v-model="values.inviteCode"
        class="input input--mono invite"
        type="text"
        maxlength="9"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="ABCD2345"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedBy"
        @input="clearError('inviteCode')"
      />
    </Field>

    <Button type="submit" variant="primary" block :loading="submitting">criar conta</Button>
    <p class="alt">
      Já tem conta?
      <RouterLink
        :to="{ path: '/entrar', query: route.query.next ? { next: route.query.next } : {} }"
        >entrar</RouterLink
      >
    </p>
  </form>
</template>

<style scoped>
.roles {
  border: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
}

.roles legend {
  margin-bottom: var(--s-2);
  padding: 0;
}

.role {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--s-1);
  padding: var(--s-4);
  padding-top: var(--s-7);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-2);
  cursor: pointer;
  transition:
    border-color var(--d-fast) var(--ease),
    box-shadow var(--d-fast) var(--ease);
}

.role:hover {
  border-color: var(--ink-3);
}

.role.is-on {
  border-color: var(--brand);
  background: var(--brand-wash);
  box-shadow: var(--shadow-1);
}

.role:has(:focus-visible) {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.role__mark {
  position: absolute;
  top: var(--s-4);
  left: var(--s-4);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--ink-2);
}

.role.is-on .role__mark {
  border: 4px solid var(--brand);
  background: var(--surface);
}

.role__title {
  font-weight: 700;
  font-size: var(--t-20);
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.role__text {
  font-size: var(--t-12);
  color: var(--ink-2);
  line-height: 1.4;
}

.invite {
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.alt {
  color: var(--ink-2);
  text-align: center;
  font-size: var(--t-14);
}
</style>
