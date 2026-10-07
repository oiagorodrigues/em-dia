import { onScopeDispose, ref, watch, type Ref } from "vue";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Ease-out cubic: fast start, gentle landing. */
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Value at time `t` (ms) of a count from `from` to `to` over `duration`. */
export function countAt(from: number, to: number, t: number, duration: number): number {
  if (t >= duration) return to;
  return Math.round(from + (to - from) * easeOut(Math.max(0, t) / duration));
}

/**
 * A number that counts up (or down) to the source's value whenever it changes. The first
 * value shows immediately; reduced motion skips the animation.
 */
export function useCountUp(
  source: () => number | null | undefined,
  duration = 600,
): Ref<number | null> {
  const shown = ref<number | null>(source() ?? null);
  let frame = 0;
  watch(source, (to, from) => {
    cancelAnimationFrame(frame);
    if (
      to === null ||
      to === undefined ||
      from === null ||
      from === undefined ||
      prefersReducedMotion()
    ) {
      shown.value = to ?? null;
      return;
    }
    const start = performance.now();
    const origin = shown.value ?? from;
    const tick = (now: number) => {
      shown.value = countAt(origin, to, now - start, duration);
      if (now - start < duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  onScopeDispose(() => cancelAnimationFrame(frame));
  return shown;
}

/** Stagger delay for list item `index`: 20ms each, capped at 8 items so long lists don't drag. */
export function staggerDelay(index: number, step = 20, cap = 8): number {
  return Math.min(index, cap) * step;
}

/**
 * Position of a single indicator (nav bar, tab underline) that slides to the active item
 * instead of jumping. `selector` finds the active item inside `container`.
 */
export function useSlidingIndicator(
  container: Ref<HTMLElement | null | undefined>,
  selector: string,
  axis: "x" | "y",
  trigger: () => unknown,
): Ref<Record<string, string>> {
  const style = ref<Record<string, string>>({ opacity: "0" });

  function measure(snap = false): void {
    const box = container.value;
    const el = box?.querySelector<HTMLElement>(selector);
    if (!box || !el) {
      style.value = { opacity: "0" };
      return;
    }
    // Only a change of the active item slides. The first placement and re-measures after a
    // resize snap, or the pill grows from 0 or animates through a transient layout.
    const still = snap || style.value.opacity !== "1";
    style.value = {
      opacity: "1",
      ...(still ? { transition: "none" } : {}),
      ...(axis === "x"
        ? { transform: `translateX(${el.offsetLeft}px)`, width: `${el.offsetWidth}px` }
        : { transform: `translateY(${el.offsetTop}px)`, height: `${el.offsetHeight}px` }),
    };
  }

  watch([container, trigger], () => requestAnimationFrame(() => measure()), {
    immediate: true,
    flush: "post",
  });
  const onResize = () => measure(true);
  if (typeof window !== "undefined") window.addEventListener("resize", onResize);
  // Items change size after mount when styles or fonts arrive late; follow them.
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
  watch(
    container,
    (box, _, onCleanup) => {
      if (!box || !observer) return;
      observer.observe(box);
      onCleanup(() => observer.unobserve(box));
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    window.removeEventListener("resize", onResize);
    observer?.disconnect();
  });
  return style;
}
