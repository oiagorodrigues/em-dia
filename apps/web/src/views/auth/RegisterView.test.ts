import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createMemoryHistory, createRouter } from "vue-router";
import RegisterView from "./RegisterView.vue";

async function render(url: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:rest(.*)*", component: { render: () => null } }],
  });
  await router.push(url);
  const wrapper = mount(RegisterView, { global: { plugins: [pinia, router] } });
  await flushPromises();
  return wrapper;
}

const loginHref = (w: Awaited<ReturnType<typeof render>>) =>
  decodeURIComponent(
    w
      .findAll("a")
      .find((a) => a.text() === "Entrar")!
      .attributes("href") ?? "",
  );

afterEach(() => document.body.replaceChildren());

describe("RegisterView with an invite", () => {
  it("sends someone who already has an account to sign in and then join", async () => {
    const w = await render("/criar-conta?convite=ABCD2345");
    expect(w.get(".has-account").text()).toContain("Entre na sua conta");
    expect(loginHref(w)).toBe("/entrar?next=/entrar-no-vinculo?convite=ABCD2345");
  });

  it("keeps the plain sign-in link without an invite", async () => {
    const w = await render("/criar-conta?next=/pagamentos");
    expect(w.find(".has-account").exists()).toBe(false);
    expect(loginHref(w)).toBe("/entrar?next=/pagamentos");
  });
});
