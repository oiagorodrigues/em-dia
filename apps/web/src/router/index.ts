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
    meta: { public: true, guestOnly: true, layout: "auth", title: "Entrar" },
  },
  {
    path: "/criar-conta",
    component: () => import("@/views/auth/RegisterView.vue"),
    meta: { public: true, guestOnly: true, layout: "auth", title: "Criar conta" },
  },
  {
    path: "/esqueci-senha",
    component: () => import("@/views/auth/ForgotPasswordView.vue"),
    meta: { public: true, layout: "auth", title: "Esqueci a senha" },
  },
  {
    path: "/redefinir-senha",
    component: () => import("@/views/auth/ResetPasswordView.vue"),
    meta: { public: true, layout: "auth", title: "Nova senha" },
  },
  { path: "/", component: () => import("@/views/HomeView.vue"), meta: { title: "Início" } },
  {
    path: "/entrar-no-vinculo",
    component: () => import("@/views/JoinContractView.vue"),
    meta: { roles: ["worker"], title: "Entrar no vínculo" },
  },
  {
    path: "/equipe",
    component: () => import("@/views/TeamView.vue"),
    meta: { roles: ["employer"], title: "Equipe" },
  },
  {
    path: "/equipe/novo",
    component: () => import("@/views/NewContractView.vue"),
    meta: { roles: ["employer"], title: "Adicionar profissional" },
  },
  // v1 links (e-mails, bookmarks, the e2e suite) keep working.
  { path: "/vinculos/novo", redirect: (to) => ({ path: "/equipe/novo", query: to.query }) },
  {
    path: "/vinculos/:id/:rest(.*)*",
    redirect: (to) => {
      const rest = ([] as string[]).concat(to.params.rest ?? []).join("/");
      return {
        path: `/equipe/${String(to.params.id)}${rest ? `/${rest}` : ""}`,
        query: to.query,
        hash: to.hash,
      };
    },
  },
  {
    path: "/equipe/:id",
    component: () => import("@/views/contract/ContractView.vue"),
    props: true,
    children: [
      { path: "", name: "contract-card", component: () => import("@/views/contract/CardTab.vue") },
      {
        path: "visao-geral",
        name: "contract-overview",
        component: () => import("@/views/contract/OverviewTab.vue"),
      },
      {
        path: "pagamentos",
        name: "contract-payments",
        component: () => import("@/views/contract/PaymentsTab.vue"),
      },
      // Extras live in Pagamentos now; old links land there.
      {
        path: "extras",
        redirect: (to) => ({ name: "contract-payments", params: to.params, query: to.query }),
      },
      {
        path: "acordos",
        name: "contract-agreements",
        component: () => import("@/views/contract/AgreementsTab.vue"),
      },
      {
        path: "historico",
        name: "contract-history",
        component: () => import("@/views/contract/HistoryTab.vue"),
      },
      {
        // Ajustes became the edit sheet; old links open it on the overview.
        path: "ajustes",
        redirect: (to) => ({
          name: "contract-overview",
          params: to.params,
          query: { ...to.query, editar: "1" },
        }),
        meta: { roles: ["employer"] },
      },
    ],
  },
  {
    path: "/pagamentos/novo",
    component: () => import("@/views/NewPaymentView.vue"),
    meta: { roles: ["employer"], title: "Novo pagamento" },
  },
  {
    path: "/cartao",
    component: () => import("@/views/BoardView.vue"),
    meta: { title: "Cartão" },
  },
  {
    path: "/pagamentos",
    component: () => import("@/views/PaymentsView.vue"),
    meta: { title: "Pagamentos" },
  },
  {
    path: "/perfil",
    component: () => import("@/views/ProfileView.vue"),
    meta: { title: "Perfil" },
  },
  {
    path: "/:pathMatch(.*)*",
    component: () => import("@/views/NotFoundView.vue"),
    meta: { public: true, layout: "bare", title: "Não encontrado" },
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
    document.title = to.meta.title ? `${to.meta.title} · em dia` : "em dia";
  });

  return router;
}
