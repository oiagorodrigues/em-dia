import type { PublicUser, Role } from "@emdia/shared";
import { describe, expect, it, vi } from "vite-plus/test";
import { createMemoryHistory, createRouter, type RouteRecordRaw } from "vue-router";
import { resolveAccess, safeNext, type GuardAuth } from "./guard.ts";

const Empty = { render: () => null };

const routes: RouteRecordRaw[] = [
  { path: "/", component: Empty },
  { path: "/perfil", component: Empty },
  { path: "/entrar", component: Empty, meta: { public: true, guestOnly: true } },
  { path: "/criar-conta", component: Empty, meta: { public: true, guestOnly: true } },
  { path: "/redefinir-senha", component: Empty, meta: { public: true } },
  { path: "/vinculos/novo", component: Empty, meta: { roles: ["employer"] } },
  { path: "/entrar-no-vinculo", component: Empty, meta: { roles: ["worker"] } },
  {
    path: "/vinculos/:id",
    component: Empty,
    children: [
      { path: "", component: Empty },
      { path: "ajustes", component: Empty, meta: { roles: ["employer"] } },
    ],
  },
];

function as(role: Role | null): GuardAuth {
  const user = role ? ({ id: "u", role, name: "X" } as PublicUser) : null;
  return { user, restore: vi.fn(async () => {}) };
}

async function go(path: string, auth: GuardAuth) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  router.beforeEach((to) => resolveAccess(to, auth));
  await router.push(path);
  return router.currentRoute.value;
}

describe("route guard", () => {
  it("restores the session before deciding", async () => {
    const auth = as(null);
    await go("/", auth);
    expect(auth.restore).toHaveBeenCalled();
  });

  it("sends anonymous visitors to /entrar with the page they wanted", async () => {
    const route = await go("/vinculos/abc", as(null));
    expect(route.path).toBe("/entrar");
    expect(route.query.next).toBe("/vinculos/abc");
  });

  it("lets anonymous visitors reach public pages", async () => {
    expect((await go("/redefinir-senha?token=x", as(null))).path).toBe("/redefinir-senha");
  });

  it("keeps workers out of employer-only routes", async () => {
    expect((await go("/vinculos/novo", as("worker"))).path).toBe("/");
    expect((await go("/vinculos/abc/ajustes", as("worker"))).path).toBe("/");
    expect((await go("/vinculos/abc", as("worker"))).path).toBe("/vinculos/abc");
  });

  it("keeps employers out of worker-only routes", async () => {
    expect((await go("/entrar-no-vinculo", as("employer"))).path).toBe("/");
    expect((await go("/vinculos/abc/ajustes", as("employer"))).path).toBe("/vinculos/abc/ajustes");
  });

  it("bounces signed-in people away from login, honouring a safe next", async () => {
    expect((await go("/entrar", as("employer"))).path).toBe("/");
    expect((await go("/entrar?next=/perfil", as("employer"))).path).toBe("/perfil");
    expect((await go("/entrar?next=//evil.com", as("employer"))).path).toBe("/");
  });

  it("sends a signed-in worker with an invite link to the join screen", async () => {
    const route = await go("/criar-conta?convite=ABCD2345", as("worker"));
    expect(route.path).toBe("/entrar-no-vinculo");
    expect(route.query.convite).toBe("ABCD2345");
  });
});

describe("invite links while signed in", () => {
  it("shows the signup screen to a signed-in employer instead of redirecting", async () => {
    const route = await go("/criar-conta?convite=ABCD2345", as("employer"));
    expect(route.path).toBe("/criar-conta");
    expect(route.query.convite).toBe("ABCD2345");
  });

  it("sends an employer who opens the join link to the signup screen", async () => {
    const route = await go("/entrar-no-vinculo?convite=ABCD2345", as("employer"));
    expect(route.path).toBe("/criar-conta");
    expect(route.query.convite).toBe("ABCD2345");
  });

  it("still bounces a signed-in employer from /criar-conta without an invite", async () => {
    expect((await go("/criar-conta", as("employer"))).path).toBe("/");
  });
});

describe("safeNext", () => {
  it("accepts only same-origin paths", () => {
    expect(safeNext("/vinculos/1?mes=2026-10")).toBe("/vinculos/1?mes=2026-10");
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext(["/a"])).toBeNull();
  });
});
