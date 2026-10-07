<script setup lang="ts">
import Skeleton from "./Skeleton.vue";

type FieldShape = "input" | "two" | "choice" | "area" | "drop";

/**
 * A form while what it needs loads: a label above each control at the control's real height
 * (48px inputs, 44px segmented choices, a textarea, the receipt drop zone), then the button.
 */
const { fields, button = true } = defineProps<{
  fields: readonly FieldShape[];
  button?: boolean;
}>();

const HEIGHT: Record<Exclude<FieldShape, "two">, string> = {
  input: "48px",
  choice: "44px",
  area: "88px",
  drop: "172px",
};
</script>

<template>
  <div class="sk-form" aria-busy="true">
    <template v-for="(f, i) in fields" :key="i">
      <div v-if="f === 'two'" class="sk-form__two">
        <span v-for="c in 2" :key="c" class="sk-form__field">
          <Skeleton w="40%" h="12px" />
          <Skeleton h="48px" />
        </span>
      </div>
      <span v-else class="sk-form__field">
        <Skeleton :w="f === 'drop' ? '30%' : '25%'" h="12px" />
        <Skeleton :h="HEIGHT[f]" />
      </span>
    </template>
    <Skeleton v-if="button" w="220px" h="48px" />
  </div>
</template>

<style scoped>
.sk-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-6);
}

.sk-form__field {
  display: grid;
  gap: var(--s-2);
}

.sk-form__two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-5);
}

@media (min-width: 520px) {
  .sk-form__two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
  }
}
</style>
