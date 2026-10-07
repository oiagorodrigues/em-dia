<script setup lang="ts">
import { useId } from "vue";

const { size = 28 } = defineProps<{ size?: number }>();

const maskId = `mark-cut-${useId()}`;
</script>

<!-- The app icon's geometric "e" and red dot (public/logo.svg) without the tile, for tight spots. -->
<template>
  <svg
    class="mark"
    :height="size"
    :width="(size * 360) / 272"
    viewBox="100 126 360 272"
    role="img"
    aria-label="em dia"
  >
    <mask :id="maskId" maskUnits="userSpaceOnUse" x="100" y="126" width="360" height="272">
      <rect x="100" y="126" width="360" height="272" fill="white" />
      <polygon points="236,285 456,285 414,391.3" fill="black" />
    </mask>
    <g :mask="`url(#${maskId})`" fill="currentColor">
      <path
        d="M236 131a131 131 0 1 0 0 262a131 131 0 1 0 0-262zm0 54a77 77 0 1 1 0 154a77 77 0 1 1 0-154z"
        fill-rule="evenodd"
      />
      <rect x="132" y="235" width="229" height="50" />
    </g>
    <circle class="mark__dot" cx="416" cy="356" r="38" />
  </svg>
</template>

<style scoped>
.mark {
  display: block;
  color: var(--ink);
}

.mark__dot {
  fill: var(--coral);
}
</style>
