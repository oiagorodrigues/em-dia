<script setup lang="ts">
import Button from "./Button.vue";
import Sheet from "./Sheet.vue";

const open = defineModel<boolean>("open", { required: true });
const {
  title,
  message,
  confirmLabel = "confirmar",
  cancelLabel = "cancelar",
  tone = "danger",
  loading = false,
} = defineProps<{
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}>();
const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <Sheet v-model:open="open" :title="title">
    <div class="cd">
      <p v-if="message">{{ message }}</p>
      <slot />
    </div>
    <template #footer>
      <Button :disabled="loading" @click="open = false">{{ cancelLabel }}</Button>
      <Button
        :variant="tone === 'danger' ? 'danger' : 'primary'"
        :loading="loading"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </Button>
    </template>
  </Sheet>
</template>

<style scoped>
.cd {
  display: grid;
  gap: var(--s-3);
  color: var(--ink-2);
}
</style>
