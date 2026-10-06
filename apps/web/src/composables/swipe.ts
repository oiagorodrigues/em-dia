import { onScopeDispose, watch, type Ref } from "vue";

/** Horizontal swipe on touch devices; ignores mostly-vertical gestures so scrolling still works. */
export function useSwipe(
  target: Ref<HTMLElement | null | undefined>,
  handlers: { left: () => void; right: () => void },
) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || e.touches.length > 1) return;
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
  };
  const onEnd = (e: TouchEvent) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) handlers.left();
    else handlers.right();
  };

  watch(
    target,
    (el, _, onCleanup) => {
      if (!el) return;
      el.addEventListener("touchstart", onStart, { passive: true });
      el.addEventListener("touchend", onEnd, { passive: true });
      onCleanup(() => {
        el.removeEventListener("touchstart", onStart);
        el.removeEventListener("touchend", onEnd);
      });
    },
    { immediate: true },
  );
  onScopeDispose(() => (tracking = false));
}
