<script setup lang="ts" generic="T extends string | number">
import { MQ, useMediaQuery } from "@/lib/media.ts";
import Segmented from "./Segmented.vue";
import Select from "./Select.vue";

export interface ChoiceOption<V> {
  value: V;
  label: string;
  description?: string;
}

const model = defineModel<T>({ required: true });
const {
  options,
  label,
  wrap = false,
  invalid = false,
  id,
  describedBy,
  breakpoint = "md",
} = defineProps<{
  options: readonly ChoiceOption<T>[];
  label: string;
  wrap?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
  /** Below this width the choice collapses into a Select. */
  breakpoint?: "md" | "lg";
}>();

/** Segmented on roomy screens, a Select on small ones: same value, same events. */
const roomy = useMediaQuery(breakpoint === "lg" ? MQ.lg : MQ.md);
</script>

<template>
  <Segmented
    v-if="roomy"
    v-model="model"
    :options="options"
    :label="label"
    :wrap="wrap"
    :invalid="invalid"
  />
  <Select
    v-else
    :id="id"
    :model-value="model"
    :options="options"
    :label="label"
    :invalid="invalid"
    :described-by="describedBy"
    @update:model-value="(v) => v !== null && (model = v as T)"
  />
</template>
