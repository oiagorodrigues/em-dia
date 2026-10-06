<script setup lang="ts">
import { useToastStore } from "@/stores/toast.ts";
import Icon from "@/components/ui/Icon.vue";

const toast = useToastStore();
</script>

<template>
  <div class="toasts" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <div
        v-for="t in toast.toasts"
        :key="t.id"
        class="toast"
        :class="`toast--${t.tone}`"
        :role="t.tone === 'error' ? 'alert' : 'status'"
      >
        <Icon v-if="t.tone === 'success'" name="check" :size="18" class="toast__icon" />
        <Icon v-else-if="t.tone === 'error'" name="alert" :size="18" class="toast__icon" />
        <p class="toast__msg">{{ t.message }}</p>
        <button
          v-if="t.action"
          type="button"
          class="toast__action"
          @click="
            t.action.run();
            toast.dismiss(t.id);
          "
        >
          {{ t.action.label }}
        </button>
        <button
          type="button"
          class="toast__close"
          aria-label="Dispensar aviso"
          @click="toast.dismiss(t.id)"
        >
          <Icon name="close" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  z-index: 50;
  left: 50%;
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--s-3));
  transform: translateX(-50%);
  width: min(100% - 2 * var(--gutter), 480px);
  display: grid;
  gap: var(--s-2);
  pointer-events: none;
}

@media (min-width: 960px) {
  .toasts {
    bottom: var(--s-6);
    left: calc(50% + var(--sidebar-w) / 2);
  }
}

:global(.layout-bare .toasts),
:global(.layout-auth .toasts) {
  bottom: calc(env(safe-area-inset-bottom) + var(--s-4));
  left: 50%;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 52px;
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
  background: var(--ink);
  color: var(--surface);
  border-radius: var(--r-1);
}

.toast--error {
  border-left: 4px solid var(--red);
}

.toast--success {
  border-left: 4px solid var(--green);
}

.toast__msg {
  flex: 1;
  font-size: var(--t-14);
  line-height: 1.35;
}

.toast__action {
  min-height: 40px;
  padding: 0 var(--s-3);
  font-weight: 700;
  font-size: var(--t-14);
  color: var(--surface);
  text-decoration: underline;
  text-underline-offset: 3px;
  border-radius: var(--r-1);
}

.toast__close {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: color-mix(in srgb, var(--surface) 70%, transparent);
  border-radius: var(--r-1);
}

.toast__action:focus-visible,
.toast__close:focus-visible {
  outline-color: var(--surface);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--d-base) var(--ease),
    transform var(--d-base) var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
