<script setup lang="ts">
import {
  changePasswordSchema,
  deleteAccountSchema,
  ROLE_LABEL,
  updateMeSchema,
} from "@emdia/shared";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { errorMessage, meApi } from "@/api";
import { setAccessToken } from "@/api/client.ts";
import PageHeader from "@/components/layout/PageHeader.vue";
import Avatar from "@/components/ui/Avatar.vue";
import Button from "@/components/ui/Button.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import Field from "@/components/ui/Field.vue";
import Icon from "@/components/ui/Icon.vue";
import PasswordInput from "@/components/ui/PasswordInput.vue";
import { useForm } from "@/composables/form.ts";
import { useInstallPrompt } from "@/composables/install.ts";
import { useInvalidate } from "@/composables/resource.ts";
import { useTheme, type ThemeMode } from "@/composables/theme.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const { mode } = useTheme();
const installer = useInstallPrompt();
/** Contracts and team lists carry the name, phone and Pix key shown to the other party. */
const invalidate = useInvalidate();

/* After "sair" or deleting the account the store forgets the user before the route changes,
 * so the page must render (briefly) without one. */
const user = computed(() => auth.user);

const me = useForm(updateMeSchema, {
  name: auth.user?.name ?? "",
  phone: auth.user?.phone ?? "",
});

function saveMe(): void {
  const input = { name: me.values.name, phone: me.values.phone?.trim() || null };
  void me.submit(async (data) => {
    const { user: updated } = await meApi.update(data);
    auth.setUser(updated);
    void invalidate.all();
    toast.success("Dados salvos.");
  }, input);
}

const pix = useForm(updateMeSchema, { pixKey: auth.user?.pixKey ?? "" });
function savePix(): void {
  void pix.submit(
    async (data) => {
      const { user: updated } = await meApi.update(data);
      auth.setUser(updated);
      void invalidate.all();
      toast.success(updated.pixKey ? "Chave Pix salva." : "Chave Pix removida.");
    },
    { pixKey: pix.values.pixKey?.trim() || null },
  );
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

const deleteOpen = ref(false);
const del = useForm(deleteAccountSchema, { password: "", confirm: "" });

/** What stays for the other party, so nobody loses records they need. */
const keptForOthers = computed(() =>
  auth.isEmployer
    ? "Quem trabalhou com você continua vendo o histórico de dias e pagamentos. Os vínculos saem da sua conta."
    : "Quem te contratou continua com o registro dos seus dias e pagamentos, com o seu nome. Seus dados de contato e Pix são apagados.",
);

function openDelete(): void {
  del.values.password = "";
  del.values.confirm = "";
  del.errors.value = {};
  del.formError.value = null;
  deleteOpen.value = true;
}

function confirmDelete(): void {
  void del.submit(async (data) => {
    await auth.deleteAccount(data.password, data.confirm);
    deleteOpen.value = false;
    await router.replace("/entrar");
    toast.success("Sua conta foi excluída.");
  });
}
</script>

<template>
  <div v-if="user" class="grid grid-cols-12 gap-6">
    <PageHeader class="col-span-12" title="Perfil" />

    <aside class="col-span-12 grid content-start gap-5 lg:col-span-4" aria-label="Você e o app">
      <section class="pf__card sheet">
        <Avatar :name="user.name" :size="64" />
        <div class="pf__who">
          <p class="pf__name">{{ user.name }}</p>
          <p class="pf__role">{{ ROLE_LABEL[user.role] }}</p>
          <p class="pf__email mono">{{ user.email }}</p>
        </div>
      </section>

      <section class="pf__block sheet" aria-labelledby="pf-theme">
        <h2 id="pf-theme" class="pf__title">Aparência</h2>
        <ChoiceField v-model="mode" :options="THEMES" label="Tema" breakpoint="lg" />
      </section>

      <section
        v-if="installer.available.value"
        id="instalar"
        class="pf__block sheet"
        aria-labelledby="pf-install"
      >
        <h2 id="pf-install" class="pf__title">Instalar o app</h2>
        <template v-if="installer.canPrompt.value">
          <p class="pf__hint">
            Abre direto da tela inicial, em tela cheia, e funciona mesmo com internet fraca.
          </p>
          <Button icon="install" variant="primary" class="justify-self-start" @click="install"
            >Instalar app</Button
          >
        </template>
        <ol v-else class="pf__ios">
          <li>
            Toque em <strong>Compartilhar</strong>
            <Icon name="share" :size="18" class="pf__inline" label="ícone de compartilhar" /> na
            barra do Safari.
          </li>
          <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Toque em <strong>Adicionar</strong>. Pronto: o em dia aparece como app.</li>
        </ol>
      </section>
    </aside>

    <div class="col-span-12 grid content-start gap-5 lg:col-span-8">
      <section class="pf__block sheet" aria-labelledby="pf-data">
        <h2 id="pf-data" class="pf__title">Dados pessoais</h2>
        <form class="grid gap-4" novalidate @submit.prevent="saveMe">
          <p v-if="me.formError.value" class="form-error" role="alert">{{ me.formError.value }}</p>
          <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
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
          </div>
          <Field v-slot="{ id }" label="E-mail" hint="Para trocar o e-mail, fale com o suporte.">
            <input :id="id" class="input input--mono" type="email" :value="user.email" disabled />
          </Field>
          <Button
            type="submit"
            variant="primary"
            :loading="me.submitting.value"
            class="justify-self-start"
            >Salvar dados</Button
          >
        </form>
      </section>

      <section v-if="auth.isWorker" class="pf__block sheet" aria-labelledby="pf-pix">
        <h2 id="pf-pix" class="pf__title">Pix</h2>
        <p class="pf__hint">Quem te contrata vê a chave na sua página e copia na hora de pagar.</p>
        <form class="grid gap-4" novalidate @submit.prevent="savePix">
          <p v-if="pix.formError.value" class="form-error" role="alert">
            {{ pix.formError.value }}
          </p>
          <Field
            v-slot="{ id, invalid, describedBy }"
            label="Chave Pix"
            optional
            :error="pix.errors.value.pixKey"
          >
            <input
              :id="id"
              v-model="pix.values.pixKey"
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
          <Button type="submit" :loading="pix.submitting.value" class="justify-self-start"
            >Salvar Pix</Button
          >
        </form>
      </section>

      <section class="pf__block sheet" aria-labelledby="pf-pw">
        <h2 id="pf-pw" class="pf__title">Senha</h2>
        <form class="grid gap-4" novalidate @submit.prevent="savePassword">
          <p v-if="pw.formError.value" class="form-error" role="alert">{{ pw.formError.value }}</p>
          <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
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
          </div>
          <Button type="submit" :loading="pw.submitting.value" class="justify-self-start"
            >Trocar senha</Button
          >
        </form>
      </section>

      <section class="pf__block sheet" aria-labelledby="pf-out">
        <h2 id="pf-out" class="pf__title">Sessões</h2>
        <p class="pf__hint">
          Use "Sair de todos os dispositivos" se você entrou num celular que não é seu ou perdeu o
          aparelho.
        </p>
        <div class="flex flex-wrap gap-3">
          <Button icon="logout" :loading="leaving === 'one'" @click="logout(false)">Sair</Button>
          <Button :loading="leaving === 'all'" @click="logout(true)"
            >Sair de todos os dispositivos</Button
          >
        </div>
      </section>

      <section class="pf__danger" aria-labelledby="pf-delete">
        <h2 id="pf-delete" class="pf__title">Excluir conta</h2>
        <p class="pf__hint">
          Seus dados pessoais são apagados e você sai de todos os aparelhos. {{ keptForOthers }}
        </p>
        <Button variant="danger" icon="trash" class="justify-self-start" @click="openDelete"
          >Excluir minha conta</Button
        >
      </section>
    </div>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Excluir sua conta?"
      confirm-label="Excluir conta"
      :loading="del.submitting.value"
      @confirm="confirmDelete"
    >
      <form id="pf-delete-form" class="grid gap-4" novalidate @submit.prevent="confirmDelete">
        <p>Não dá para desfazer. {{ keptForOthers }}</p>
        <p v-if="del.formError.value" class="form-error" role="alert">{{ del.formError.value }}</p>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Sua senha"
          :error="del.errors.value.password"
        >
          <PasswordInput
            :id="id"
            v-model="del.values.password"
            :invalid="invalid"
            :described-by="describedBy"
            @update:model-value="del.clearError('password')"
          />
        </Field>
        <Field
          v-slot="{ id, invalid, describedBy }"
          label="Digite EXCLUIR para confirmar"
          :error="del.errors.value.confirm"
        >
          <input
            :id="id"
            v-model="del.values.confirm"
            class="input input--mono"
            type="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedBy"
            @input="del.clearError('confirm')"
          />
        </Field>
      </form>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.pf__card {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-5);
}

.pf__who {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.pf__name {
  font-weight: 700;
  font-size: var(--t-20);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.pf__role {
  font-size: var(--t-14);
  color: var(--ink-2);
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
  padding: var(--s-5);
}

.pf__title {
  font-size: var(--t-20);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.pf__hint {
  font-size: var(--t-14);
  color: var(--ink-2);
}

.pf__ios {
  display: grid;
  gap: var(--s-3);
  padding-left: var(--s-5);
  font-size: var(--t-14);
}

.pf__ios li::marker {
  font-family: var(--font-mono);
  color: var(--ink-2);
}

.pf__inline {
  display: inline;
  vertical-align: -3px;
  color: var(--brand);
}

.pf__danger {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-5);
  border: 1px solid color-mix(in srgb, var(--coral) 45%, var(--rule));
  border-radius: var(--r-2);
  background: var(--coral-wash);
}

.pf__danger .pf__title {
  color: var(--coral-ink);
}

.pf__danger .pf__hint {
  color: var(--ink);
}
</style>
