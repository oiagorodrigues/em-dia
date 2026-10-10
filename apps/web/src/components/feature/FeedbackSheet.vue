<script setup lang="ts">
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  feedbackSchema,
  type FeedbackKind,
} from "@emdia/shared";
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { feedbackApi } from "@/api";
import Button from "@/components/ui/Button.vue";
import ChoiceField from "@/components/ui/ChoiceField.vue";
import Field from "@/components/ui/Field.vue";
import Sheet from "@/components/ui/Sheet.vue";
import { useForm } from "@/composables/form.ts";
import { useToastStore } from "@/stores/toast.ts";

const open = defineModel<boolean>("open", { required: true });
const route = useRoute();
const toast = useToastStore();

const kindOptions = FEEDBACK_KINDS.map((k) => ({ value: k, label: FEEDBACK_KIND_LABEL[k] }));
const { values, errors, formError, submitting, submit, clearError } = useForm(feedbackSchema, {
  kind: "idea" as FeedbackKind,
  message: "",
});

const PLACEHOLDER: Record<FeedbackKind, string> = {
  idea: "O que deixaria o em dia mais útil para você?",
  problem: "O que aconteceu? Se puder, conte o que você fez antes.",
  other: "Escreva o que quiser contar.",
};
const left = computed(() => FEEDBACK_MESSAGE_MAX - values.message.length);

/** A sent message clears the form; closing without sending keeps the draft for later. */
watch(open, (isOpen) => {
  if (isOpen) formError.value = null;
});

function onSubmit(): void {
  void submit(
    async (data) => {
      await feedbackApi.send(data);
      toast.success("Mensagem enviada. Obrigado!");
      values.message = "";
      values.kind = "idea";
      open.value = false;
    },
    { ...values, page: route.fullPath },
  );
}
</script>

<template>
  <Sheet
    v-model:open="open"
    title="Enviar feedback"
    subtitle="O em dia está em beta. Sua opinião ajuda a decidir o que vem a seguir."
  >
    <form id="feedback-form" class="fb" novalidate @submit.prevent="onSubmit">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <Field v-slot="{ id }" label="Sobre o quê">
        <ChoiceField
          :id="id"
          v-model="values.kind"
          :options="kindOptions"
          label="Sobre o quê"
          @update:model-value="clearError('kind')"
        />
      </Field>
      <Field
        v-slot="{ id, invalid, describedBy }"
        label="Mensagem"
        :error="errors.message"
        :hint="
          left < 200
            ? `${left} caracteres restantes`
            : 'Quem responde é uma pessoa, pelo seu e-mail.'
        "
      >
        <textarea
          :id="id"
          v-model="values.message"
          class="input"
          rows="6"
          :maxlength="FEEDBACK_MESSAGE_MAX"
          :placeholder="PLACEHOLDER[values.kind]"
          :aria-invalid="invalid || undefined"
          :aria-describedby="describedBy"
          @input="clearError('message')"
        />
      </Field>
    </form>
    <template #footer>
      <Button @click="open = false">Cancelar</Button>
      <Button type="submit" form="feedback-form" variant="primary" icon="send" :loading="submitting"
        >Enviar</Button
      >
    </template>
  </Sheet>
</template>

<style scoped>
.fb {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}
</style>
