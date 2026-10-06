import { computed } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";

/** Paths "voltar" must never lead to: you'd land on a screen that bounces you away again. */
const DEAD_ENDS = ["/entrar", "/criar-conta", "/esqueci-senha", "/redefinir-senha"];

/** Where the person came from, when it was a screen inside the app (vue-router keeps it in history.state.back). */
export function previousInApp(
  state: unknown = typeof window === "undefined" ? null : window.history.state,
): string | null {
  const back = (state as { back?: unknown } | null)?.back;
  if (typeof back !== "string" || !back.startsWith("/") || back.startsWith("//")) return null;
  if (DEAD_ENDS.some((p) => back === p || back.startsWith(`${p}?`))) return null;
  return back;
}

/**
 * "voltar" goes to the previous screen when it was inside the app, otherwise to `fallback`
 * (the module's list) — e.g. when the page was opened from a link or after a reload.
 * `go()` also suits form saves: they return to where the form was opened from.
 */
export function useBack(fallback: RouteLocationRaw) {
  const router = useRouter();
  const to = computed<RouteLocationRaw>(() => {
    // Re-read on every navigation; history.state isn't reactive on its own.
    void router.currentRoute.value.fullPath;
    return previousInApp() ?? fallback;
  });

  async function go(): Promise<void> {
    if (previousInApp()) router.back();
    else await router.push(fallback);
  }

  return { to, go };
}
