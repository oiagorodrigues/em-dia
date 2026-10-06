<script setup lang="ts">
const {
  text,
  label,
  tone = "red",
  size = "md",
  tilt = -4,
} = defineProps<{
  text: string;
  /** Full accessible description, e.g. "Falta justificada". */
  label?: string;
  tone?: "red" | "green" | "blue" | "ink";
  size?: "sm" | "md" | "lg";
  tilt?: number;
}>();
</script>

<template>
  <span
    class="stamp mono"
    :class="[`stamp--${tone}`, `stamp--${size}`]"
    :style="{ '--tilt': `${tilt}deg` }"
    role="img"
    :aria-label="label ?? text"
    >{{ text }}</span
  >
</template>

<style scoped>
.stamp {
  display: inline-block;
  padding: 0.2em 0.55em 0.15em;
  border: 2px solid currentColor;
  border-radius: var(--r-1);
  font-weight: 700;
  font-stretch: 87.5%;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  line-height: 1.1;
  white-space: nowrap;
  transform: rotate(var(--tilt));
  opacity: 0.86;
  mix-blend-mode: multiply;
  /* uneven ink: a faint inner ring makes it read as rubber, not a CSS border */
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 25%, transparent);
  user-select: none;
}

:root[data-theme="dark"] .stamp {
  mix-blend-mode: normal;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .stamp {
    mix-blend-mode: normal;
  }
}

.stamp--sm {
  font-size: 10px;
}
.stamp--md {
  font-size: var(--t-12);
}
.stamp--lg {
  font-size: var(--t-16);
  border-width: 3px;
}

.stamp--red {
  color: var(--red);
}
.stamp--green {
  color: var(--green);
}
.stamp--blue {
  color: var(--blue);
}
.stamp--ink {
  color: var(--ink-2);
}
</style>
