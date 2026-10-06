import type { PublicUser } from "@ponto/shared";
import type { RouteLocationNormalized, RouteLocationRaw } from "vue-router";

export interface GuardAuth {
  user: PublicUser | null;
  restore: () => Promise<void>;
}

/** Restores the session once, then gates by `meta.public` / `meta.roles`. */
export async function resolveAccess(
  to: RouteLocationNormalized,
  auth: GuardAuth,
): Promise<true | RouteLocationRaw> {
  await auth.restore();
  const user = auth.user;

  if (to.meta.public) {
    if (user && to.meta.guestOnly) {
      const invite = typeof to.query.convite === "string" ? to.query.convite : null;
      if (invite && user.role === "worker")
        return { path: "/entrar-no-vinculo", query: { convite: invite } };
      return safeNext(to.query.next) ?? "/";
    }
    return true;
  }

  if (!user) return { path: "/entrar", query: to.fullPath === "/" ? {} : { next: to.fullPath } };

  const roles = to.matched.flatMap((r) => r.meta.roles ?? []);
  if (roles.length > 0 && !roles.includes(user.role)) return "/";
  return true;
}

/** Only same-origin app paths; rejects "//evil.com" and absolute URLs. */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
