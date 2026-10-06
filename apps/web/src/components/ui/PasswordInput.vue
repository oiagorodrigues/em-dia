<script setup lang="ts">
import { ref } from "vue";

const model = defineModel<string>({ required: true });
const {
  id,
  invalid = false,
  describedBy,
  autocomplete = "current-password",
} = defineProps<{
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  autocomplete?: "current-password" | "new-password";
}>();

const visible = ref(false);
</script>

<template>
  <div class="pw">
    <input
      :id="id"
      v-model="model"
      class="input pw__input"
      :type="visible ? 'text' : 'password'"
      :autocomplete="autocomplete"
      autocapitalize="off"
      spellcheck="false"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy"
    />
    <button
      type="button"
      class="pw__toggle"
      :aria-pressed="visible"
      :aria-label="visible ? 'Esconder senha' : 'Mostrar senha'"
      @click="visible = !visible"
    >
      {{ visible ? "esconder" : "mostrar" }}
    </button>
  </div>
</template>

<style scoped>
.pw {
  position: relative;
}

.pw__input {
  padding-right: 92px;
}

.pw__toggle {
  position: absolute;
  right: 2px;
  top: 2px;
  bottom: 2px;
  min-width: 80px;
  padding: 0 var(--s-3);
  font-size: var(--t-12);
  font-weight: 600;
  color: var(--ink-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-radius: var(--r-1);
}

.pw__toggle:hover {
  color: var(--ink);
}
</style>
