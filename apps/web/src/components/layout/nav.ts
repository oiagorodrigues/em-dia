import type { Role } from "@emdia/shared";
import type { RouteLocationNormalizedLoaded } from "vue-router";
import type { IconName } from "@/components/ui/icons.ts";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  match: (route: RouteLocationNormalizedLoaded) => boolean;
}

const contractTab = (route: RouteLocationNormalizedLoaded) =>
  typeof route.name === "string" && route.name.startsWith("contract-");

export function navItems(role: Role | null): NavItem[] {
  const employer = role === "employer";
  return [
    { to: "/", label: "Início", icon: "home", match: (r) => r.path === "/" },
    ...(employer
      ? [
          {
            to: "/equipe",
            label: "Equipe",
            icon: "users" as const,
            match: (r: RouteLocationNormalizedLoaded) => r.path.startsWith("/equipe"),
          },
        ]
      : []),
    {
      to: "/cartao",
      label: "Cartão",
      icon: "card",
      // The worker reaches their card through the contract pages; the employer through Equipe.
      match: (r) =>
        r.path === "/cartao" || (!employer && contractTab(r) && r.name !== "contract-payments"),
    },
    {
      to: "/pagamentos",
      label: "Pagamentos",
      icon: "wallet",
      match: (r) =>
        r.path.startsWith("/pagamentos") || (!employer && r.name === "contract-payments"),
    },
    { to: "/perfil", label: "Perfil", icon: "user", match: (r) => r.path === "/perfil" },
  ];
}
