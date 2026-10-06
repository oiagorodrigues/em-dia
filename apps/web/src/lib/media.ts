import { onScopeDispose, ref, type Ref } from "vue";

/** Reactive `matchMedia`; defaults to `fallback` where matchMedia is missing (tests, SSR). */
export function useMediaQuery(query: string, fallback = true): Ref<boolean> {
  const mql = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query) : null;
  const matches = ref(mql ? mql.matches : fallback);
  if (mql) {
    const update = (e: MediaQueryListEvent) => (matches.value = e.matches);
    mql.addEventListener("change", update);
    onScopeDispose(() => mql.removeEventListener("change", update));
  }
  return matches;
}

export const MQ = {
  md: "(min-width: 640px)",
  lg: "(min-width: 960px)",
  xl: "(min-width: 1280px)",
  "2xl": "(min-width: 1600px)",
} as const;
