<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
import { ACTION_ICON } from "@/components/ui/icons.ts";
import { useFeedbackSheet } from "@/composables/feedback.ts";

const feedback = useFeedbackSheet();
</script>

<template>
  <button type="button" class="fb-float" @click="feedback.show">
    <Icon :name="ACTION_ICON.feedback" :size="16" />
    <span>Feedback</span>
  </button>
</template>

<style scoped>
/* Desktop only: on phones the corner belongs to the bottom bar and card actions, so feedback
   stays in the account menu there. A tab on the right edge, mid-height, fits in the page
   gutter (≥ 29px from 960px), so it never covers content, sticky asides included. */
.fb-float {
  display: none;
}

@media (min-width: 960px) {
  .fb-float {
    position: fixed;
    z-index: 20;
    top: 50%;
    right: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    width: 28px;
    padding: var(--s-3) 0;
    border: 1px solid var(--rule);
    border-right: 0;
    border-radius: var(--r-1) 0 0 var(--r-1);
    background: var(--surface);
    color: var(--ink-2);
    font-size: var(--t-12);
    font-weight: 600;
    letter-spacing: 0.02em;
    writing-mode: vertical-rl;
    transform: translateY(-50%) rotate(180deg);
    box-shadow: var(--shadow-1);
    cursor: pointer;
    transition:
      color var(--d-fast) var(--ease-out),
      width var(--d-fast) var(--ease-out);
  }
  .fb-float :deep(.icon) {
    transform: rotate(90deg);
  }
  .fb-float:hover {
    width: 32px;
    color: var(--brand);
  }
  .fb-float:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  /* Out of the way while a sheet or dialog is open. */
  :global(html.has-sheet .fb-float) {
    display: none;
  }
}
</style>
