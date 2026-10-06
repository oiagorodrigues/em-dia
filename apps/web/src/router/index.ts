import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from "vue-router";
import { useAuthStore } from "@/stores/auth.ts";
import { resolveAccess } from "./guard.ts";

export const routes: RouteRecordRaw[] = [
  {
    path: "/entrar",
    component: () => import("@/views/auth/LoginView.vue"),
    meta: { public: true, guestOnly: true, layout: "auth", title: "entrar" },
  },
  {
    path: "/criar-conta",
    component: () => import("@/views/auth/RegisterView.vue"),
    meta: { public: true, guestOnly: true, layout: "auth", title: "criar conta" },
  },
  {
    path: "/esqueci-senha",
    component: () => import("@/views/auth/ForgotPasswordView.vue"),
    meta: { public: true, layout: "auth", title: "esqueci a senha" },
  },
  {
    path: "/redefinir-senha",
    component: () => import("@/views/auth/ResetPasswordView.vue"),
    meta: { public: true, layout: "auth", title: "nova senha" },
  },
  { path: "/", component: () => import("@/views/HomeView.vue"), meta: { title: "início" } },
  {
    path: "/entrar-no-vinculo",
    component: () => import("@/views/JoinContractView.vue"),
    meta: { roles: ["worker"], title: "entrar no vínculo" },
  },
  {
    path: "/vinculos/novo",
    component: () => import("@/views/NewContractView.vue"),
    meta: { roles: ["employer"], title: "novo vínculo" },
  },
  {
    path: "/vinculos/:id",
    component: () => import("@/views/contract/ContractView.vue"),
    props: true,
    children: [
      { path: "", name: "contract-card", component: () => import("@/views/contract/CardTab.vue") },
      {
        path: "pagamentos",
        name: "contract-payments",
        component: () => import("@/views/contract/PaymentsTab.vue"),
      },
      {
        path: "extras",
        name: "contract-extras",
        component: () => import("@/views/contract/ExtrasTab.vue"),
      },
      {
        path: "historico",
        name: "contract-history",
        component: () => import("@/views/contract/HistoryTab.vue"),
      },
      {
        path: "ajustes",
        name: "contract-settings",
        component: () => import("@/views/contract/SettingsTab.vue"),
        meta: { roles: ["employer"] },
      },
    ],
  },
  {
    path: "/pagamentos/novo",
    component: () => import("@/views/NewPaymentView.vue"),
    meta: { roles: ["employer"], title: "novo pagamento" },
  },
  {
    path: "/cartao",
    component: () => import("@/views/ContractPickerView.vue"),
    props: { tab: "card" },
    meta: { title: "cartão" },
  },
  {
    path: "/pagamentos",
    component: () => import("@/views/ContractPickerView.vue"),
    props: { tab: "payments" },
    meta: { title: "pagamentos" },
  },
  {
    path: "/perfil",
    component: () => import("@/views/ProfileView.vue"),
    meta: { title: "perfil" },
  },
  {
    path: "/:pathMatch(.*)*",
    component: () => import("@/views/NotFoundView.vue"),
    meta: { public: true, layout: "bare", title: "não encontrado" },
  },
];

export function createAppRouter(history: RouterHistory = createWebHistory()): Router {
  const router = createRouter({
    history,
    routes,
    scrollBehavior(to, from, saved) {
      if (saved) return saved;
      // Switching contract tabs keeps the page where it is; everything else starts at the top.
      if (to.params.id && to.params.id === from.params.id) return false;
      return { top: 0 };
    },
  });

  router.beforeEach((to) => resolveAccess(to, useAuthStore()));

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · ponto.` : "ponto.";
  });

  return router;
}
