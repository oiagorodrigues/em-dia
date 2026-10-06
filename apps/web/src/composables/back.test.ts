import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { previousInApp, useBack } from "./back.ts";

describe("previousInApp", () => {
  it("accepts app paths and rejects auth screens and foreign values", () => {
    expect(previousInApp({ back: "/equipe?status=removidos" })).toBe("/equipe?status=removidos");
    expect(previousInApp({ back: "/entrar?next=/x" })).toBeNull();
    expect(previousInApp({ back: "//evil.com" })).toBeNull();
    expect(previousInApp({ back: null })).toBeNull();
    expect(previousInApp(null)).toBeNull();
  });
});

describe("useBack", () => {
  async function setup() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { render: () => null } },
        { path: "/equipe", component: { render: () => null } },
        { path: "/equipe/:id", component: { render: () => null } },
      ],
    });
    let api!: ReturnType<typeof useBack>;
    mount(
      defineComponent(() => {
        api = useBack("/equipe");
        return () => null;
      }),
      { global: { plugins: [router] } },
    );
    return { router, api: () => api };
  }

  it("falls back to the module list when the page was opened directly", async () => {
    const { router, api } = await setup();
    window.history.replaceState({ back: null }, "");
    await router.push("/equipe/1");
    window.history.replaceState({ back: null }, "");
    await api().go();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/equipe");
  });

  it("points the link at the previous in-app screen", async () => {
    const { api } = await setup();
    window.history.replaceState({ back: "/" }, "");
    expect(previousInApp()).toBe("/");
    expect(api().to.value).toBeDefined();
  });
});
