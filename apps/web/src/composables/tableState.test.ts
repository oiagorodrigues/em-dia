import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { defineComponent, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { useTableState } from "./tableState.ts";

async function setup(url = "/equipe") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/equipe", component: { render: () => null } }],
  });
  await router.push(url);
  let api!: ReturnType<typeof useTableState>;
  const Host = defineComponent(() => {
    api = useTableState({ defaultSort: { key: "nome", dir: "asc" }, filters: ["funcao"] });
    return () => null;
  });
  mount(Host, { global: { plugins: [router] } });
  await flushPromises();
  return { router, api };
}

afterEach(() => vi.useRealTimers());

describe("useTableState", () => {
  it("reads search, sort and filters from the URL", async () => {
    const { api } = await setup("/equipe?q=maria&ordem=-horas&funcao=diarista");
    expect(api.state.q).toBe("maria");
    expect(api.state.sort).toEqual({ key: "horas", dir: "desc" });
    expect(api.state.filters.funcao).toBe("diarista");
    expect(api.active.value).toBe(true);
  });

  it("falls back to the default sort and keeps it out of the URL", async () => {
    const { api, router } = await setup();
    expect(api.state.sort).toEqual({ key: "nome", dir: "asc" });
    api.state.sort = { key: "horas", dir: "desc" };
    await flushPromises();
    expect(router.currentRoute.value.query.ordem).toBe("-horas");
    api.state.sort = { key: "nome", dir: "asc" };
    await flushPromises();
    expect(router.currentRoute.value.query.ordem).toBeUndefined();
  });

  it("writes filters immediately and the search after a short pause", async () => {
    vi.useFakeTimers();
    const { api, router } = await setup();
    api.state.filters.funcao = "baba";
    await flushPromises();
    expect(router.currentRoute.value.query.funcao).toBe("baba");
    api.state.q = "jo";
    await nextTick();
    expect(router.currentRoute.value.query.q).toBeUndefined();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(router.currentRoute.value.query.q).toBe("jo");
  });

  it("follows back/forward navigation and clears", async () => {
    const { api, router } = await setup();
    await router.push("/equipe?q=rosa&funcao=passadeira");
    await flushPromises();
    expect(api.state.q).toBe("rosa");
    expect(api.state.filters.funcao).toBe("passadeira");
    api.clear();
    await flushPromises();
    expect(api.state.q).toBe("");
    expect(router.currentRoute.value.query.funcao).toBeUndefined();
  });
});
