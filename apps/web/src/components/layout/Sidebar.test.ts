import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createMemoryHistory, createRouter } from "vue-router";
import { TOOLTIP_DELAY, tooltipWarm } from "@/components/ui/tooltip.ts";
import { SIDEBAR_STORAGE_KEY } from "@/composables/sidebar.ts";
import { useAuthStore } from "@/stores/auth.ts";
import Sidebar from "./Sidebar.vue";

const mounted: { unmount(): void }[] = [];

async function render() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = {
    id: "u1",
    name: "Ana Souza",
    email: "ana@emdia.dev",
    role: "employer",
  } as ReturnType<typeof useAuthStore>["user"];
  const blank = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ["/", "/equipe", "/cartao", "/pagamentos", "/perfil", "/entrar"].map((path) => ({
      path,
      component: blank,
    })),
  });
  await router.push("/equipe");
  const wrapper = mount(Sidebar, { global: { plugins: [pinia, router] }, attachTo: document.body });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

const toggle = (w: Awaited<ReturnType<typeof render>>) => w.get("button[aria-controls]");

beforeEach(() => {
  localStorage.clear();
  tooltipWarm.reset();
});

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.replaceChildren();
  delete document.documentElement.dataset.sidebar;
  vi.useRealTimers();
});

describe("Sidebar collapse", () => {
  it("starts expanded with the wordmark and every label visible", async () => {
    const w = await render();
    expect(w.get("aside").classes()).not.toContain("is-collapsed");
    expect(w.find(".wordmark").exists()).toBe(true);
    expect(toggle(w).attributes("aria-expanded")).toBe("true");
    expect(toggle(w).text()).toBe("Recolher menu");
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
  });

  it("shrinks to icons, swaps in the mark and remembers the choice", async () => {
    const w = await render();
    await toggle(w).trigger("click");
    expect(w.get("aside").classes()).toContain("is-collapsed");
    expect(w.find(".mark").exists()).toBe(true);
    expect(w.find(".wordmark").exists()).toBe(false);
    expect(toggle(w).attributes("aria-expanded")).toBe("false");
    expect(toggle(w).text()).toBe("Expandir menu");
    expect(document.documentElement.dataset.sidebar).toBe("collapsed");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("collapsed");

    // Labels stay in the DOM (visually hidden) so each link keeps its accessible name.
    const links = w.findAll("nav a").map((a) => a.text());
    expect(links).toEqual(["Início", "Equipe", "Cartão", "Pagamentos", "Perfil"]);

    mounted.splice(mounted.indexOf(w), 1);
    w.unmount();
    const again = await render();
    expect(again.get("aside").classes()).toContain("is-collapsed");

    await toggle(again).trigger("click");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
  });

  it("shows item labels as tooltips only while collapsed", async () => {
    vi.useFakeTimers();
    const w = await render();
    const anchor = () => w.findAll(".tip-anchor")[1]!;
    const tip = () => document.body.querySelector('[role="tooltip"]');

    await anchor().trigger("mouseenter");
    vi.advanceTimersByTime(TOOLTIP_DELAY);
    await flushPromises();
    expect(tip()).toBeNull();
    await anchor().trigger("mouseleave");

    await toggle(w).trigger("click");
    tooltipWarm.reset();
    await anchor().trigger("mouseenter");
    vi.advanceTimersByTime(TOOLTIP_DELAY);
    await flushPromises();
    expect(tip()?.textContent?.trim()).toBe("Equipe");
  });

  it("still works when storage is blocked", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const w = await render();
    await toggle(w).trigger("click");
    expect(w.get("aside").classes()).toContain("is-collapsed");
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
