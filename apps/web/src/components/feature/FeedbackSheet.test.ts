import type { PublicUser } from "@emdia/shared";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createMemoryHistory, createRouter } from "vue-router";
import { ApiError, feedbackApi } from "@/api";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import FeedbackSheet from "./FeedbackSheet.vue";

async function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: "u1", name: "Ana", role: "employer" } as PublicUser;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:rest(.*)*", component: { render: () => null } }],
  });
  await router.push("/equipe/c1/cartao");
  const wrapper = mount(FeedbackSheet, {
    props: { open: true },
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  });
  await flushPromises();
  return wrapper;
}

const form = () => document.querySelector<HTMLFormElement>("#feedback-form")!;
const textarea = () => form().querySelector("textarea")!;
async function type(text: string) {
  textarea().value = text;
  textarea().dispatchEvent(new Event("input"));
  await flushPromises();
}
async function send() {
  form().dispatchEvent(new Event("submit"));
  await flushPromises();
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("FeedbackSheet", () => {
  it("sends the message with the screen it came from, then closes and clears", async () => {
    const api = vi.spyOn(feedbackApi, "send").mockResolvedValue(undefined);
    const wrapper = await setup();
    await type("  O cartão podia mostrar o total da semana  ");
    await send();
    expect(api).toHaveBeenCalledWith({
      kind: "idea",
      message: "O cartão podia mostrar o total da semana",
      page: "/equipe/c1/cartao",
    });
    expect(useToastStore().toasts.at(-1)?.message).toBe("Mensagem enviada. Obrigado!");
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
    await wrapper.setProps({ open: false } as never);
    await wrapper.setProps({ open: true } as never);
    await flushPromises();
    expect(textarea().value).toBe("");
    wrapper.unmount();
  });

  it("asks for more before sending a too short message", async () => {
    const api = vi.spyOn(feedbackApi, "send");
    const wrapper = await setup();
    await type("oi");
    await send();
    expect(api).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Conte um pouco mais");
    wrapper.unmount();
  });

  it("keeps the draft and shows the error when sending fails", async () => {
    vi.spyOn(feedbackApi, "send").mockRejectedValue(
      new ApiError(500, "INTERNAL", "Não deu para enviar agora. Tente de novo em instantes."),
    );
    const wrapper = await setup();
    await type("A tela de pagamentos travou");
    await send();
    expect(document.body.textContent).toContain("Não deu para enviar agora");
    expect(textarea().value).toBe("A tela de pagamentos travou");
    expect(wrapper.emitted("update:open")).toBeUndefined();
    wrapper.unmount();
  });
});
