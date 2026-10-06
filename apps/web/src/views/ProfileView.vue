<script setup lang="ts">
import { changePasswordSchema, ROLE_LABEL, updateMeSchema } from "@emdia/shared";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { errorMessage, meApi } from "@/api";
import { setAccessToken } from "@/api/client.ts";
import PageHeader from "@/components/layout/PageHeader.vue";
import Button from "@/components/ui/Button.vue";
import Field from "@/components/ui/Field.vue";
import Icon from "@/components/ui/Icon.vue";
import PasswordInput from "@/components/ui/PasswordInput.vue";
import Segmented from "@/components/ui/Segmented.vue";
import { useForm } from "@/composables/form.ts";
import { useInstallPrompt } from "@/composables/install.ts";
import { useTheme, type ThemeMode } from "@/composables/theme.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const { mode } = useTheme();
const installer = useInstallPrompt();

const user = auth.user!;

const me = useForm(updateMeSchema, {
  name: user.name,
  phone: user.phone ?? "",
  pixKey: user.pixKey ?? "",
});

function saveMe(): void {
  const input = {
    name: me.values.name,
    phone: me.values.phone?.trim() || null,
    ...(auth.isWorker ? { pixKey: me.values.pixKey?.trim() || null } : {}),
  };
  void me.submit(async (data) => {
    const { user: updated } = await meApi.update(data);
    auth.setUser(updated);
    toast.success("Dados salvos.");
  }, input);
}

const pw = useForm(changePasswordSchema, { currentPassword: "", newPassword: "" });
function savePassword(): void {
  void pw.submit(async (data) => {
    const res = await meApi.changePassword(data.currentPassword, data.newPassword);
    if (res?.accessToken) setAccessToken(res.accessToken);
    pw.values.currentPassword = "";
    pw.values.newPassword = "";
    toast.success("Senha trocada. Os outros aparelhos foram desconectados.");
  });
}

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
];

const leaving = ref<"one" | "all" | null>(null);
async function logout(all: boolean): Promise<void> {
  leaving.value = all ? "all" : "one";
  try {
    if (all) await auth.logoutAll();
    else await auth.logout();
    await router.replace("/entrar");
  } catch (e) {
    toast.error(errorMessage(e));
  } finally {
    leaving.value = null;
  }
}

async function install(): Promise<void> {
  if (await installer.install()) toast.success("App instalado.");
}
</script>

<template>
  <div class="pf">
    <PageHeader title="perfil" />

    <section class="pf__id sheet">
      <span class="pf__avatar mono" aria-hidden="true">{{
        user.name.trim().charAt(0).toUpperCase()
      }}</span>
      <div class="pf__idtext">
        <p class="pf__name">{{ auth.user?.name }}</p>
        <p class="pf__email mono">{{ user.email }}</p>
      </div>
      <span class="label">{{ ROLE_LABEL[user.role] }}</span>
    </section>

    <section class="pf__block" aria-labelledby="pf-data">
      <h2 id="pf-data" class="section-title">seus dados</h2>
      <form class="stack" novalidate @submit.prevent="saveMe">
        <p v-if="me.formError.value" class="form-error" role="alert">{{ me.formError.value }}</p>
        <Field v-slot="{ id, invalid, describedBy }" label="Nome" :error="me.errors.value.name">
          <input
            :id="id"
            v-model="me.values.name"
            class="input"
            type="text"
            autocomplete="name"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            @input="me.clearError('name')"
          />
        </Field>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Celular"
          optional
          :error="me.errors.value.phone"
        >
          <input
            :id="id"
            v-model="me.values.phone"
            class="input input--mono"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="(11) 91234-5678"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
          />
        </Field>
        <Field
          v-if="auth.isWorker"
          v-slot="{ id, invalid, describedBy }"
          label="Chave Pix"
          optional
          hint="Para quem te contrata copiar na hora de pagar."
          :error="me.errors.value.pixKey"
        >
          <input
            :id="id"
            v-model="me.values.pixKey"
            class="input input--mono"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="CPF, celular, e-mail ou chave aleatória"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
          />
        </Field>
        <Button type="submit" variant="primary" :loading="me.submitting.value" class="pf__submit"
          >salvar</Button
        >
      </form>
    </section>

    <section class="pf__block" aria-labelledby="pf-theme">
      <h2 id="pf-theme" class="section-title">aparência</h2>
      <Segmented v-model="mode" :options="THEMES" label="Tema" class="pf__theme" />
    </section>

    <section
      v-if="installer.available.value"
      id="instalar"
      class="pf__block"
      aria-labelledby="pf-install"
    >
      <h2 id="pf-install" class="section-title">instalar app</h2>
      <template v-if="installer.canPrompt.value">
        <p class="muted">
          Abre direto da tela inicial, em tela cheia, e funciona mesmo com internet fraca.
        </p>
        <Button icon="install" variant="primary" class="pf__submit" @click="install"
          >instalar app</Button
        >
      </template>
      <ol v-else class="pf__ios">
        <li>
          Toque em <strong>Compartilhar</strong>
          <Icon name="share" :size="18" class="pf__inline" label="ícone de compartilhar" /> na barra
          do Safari.
        </li>
        <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
        <li>Toque em <strong>Adicionar</strong>. Pronto: o em dia aparece como app.</li>
      </ol>
    </section>

    <section class="pf__block" aria-labelledby="pf-pw">
      <h2 id="pf-pw" class="section-title">senha</h2>
      <form class="stack" novalidate @submit.prevent="savePassword">
        <p v-if="pw.formError.value" class="form-error" role="alert">{{ pw.formError.value }}</p>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Senha atual"
          :error="pw.errors.value.currentPassword ? 'Informe a senha atual' : null"
        >
          <PasswordInput
            :id="id"
            v-model="pw.values.currentPassword"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="pw.clearError('currentPassword')"
          />
        </Field>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Senha nova"
          :error="pw.errors.value.newPassword"
          hint="Pelo menos 10 caracteres, com letras e números."
        >
          <PasswordInput
            :id="id"
            v-model="pw.values.newPassword"
            autocomplete="new-password"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="pw.clearError('newPassword')"
          />
        </Field>
        <Button type="submit" :loading="pw.submitting.value" class="pf__submit"
          >trocar senha</Button
        >
      </form>
    </section>

    <section class="pf__block pf__out" aria-labelledby="pf-out">
      <h2 id="pf-out" class="section-title">sessão</h2>
      <div class="pf__outbtns">
        <Button icon="logout" :loading="leaving === 'one'" @click="logout(false)">sair</Button>
        <Button variant="danger" :loading="leaving === 'all'" @click="logout(true)"
          >sair de todos os aparelhos</Button
        >
      </div>
      <p class="muted pf__small">
        Use “sair de todos” se você entrou num celular que não é seu ou perdeu o aparelho.
      </p>
    </section>
  </div>
</template>

<style scoped>
.pf {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-8);
}

.pf__id {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  margin-top: calc(var(--s-4) * -1);
}

.pf__avatar {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 50%;
  background: var(--ink);
  color: var(--sheet);
  font-size: var(--t-20);
  font-weight: 700;
}

.pf__idtext {
  flex: 1;
  min-width: 0;
}

.pf__name {
  font-weight: 700;
  font-size: var(--t-20);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.pf__email {
  font-size: var(--t-12);
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pf__block {
  display: grid;
  gap: var(--s-4);
}

.pf__submit {
  justify-self: start;
  min-width: 160px;
}

.pf__theme {
  max-width: 360px;
}

.pf__ios {
  display: grid;
  gap: var(--s-3);
  padding-left: var(--s-5);
}

.pf__ios li::marker {
  font-family: var(--font-mono);
  color: var(--ink-2);
}

.pf__inline {
  display: inline;
  vertical-align: -3px;
  color: var(--blue);
}

.pf__out {
  padding-top: var(--s-6);
  border-top: 1px dashed var(--rule);
}

.pf__outbtns {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
}

.pf__small {
  font-size: var(--t-14);
}
</style>
