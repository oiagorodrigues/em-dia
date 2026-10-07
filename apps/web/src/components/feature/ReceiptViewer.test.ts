import type { Payment } from "@emdia/shared";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { defineComponent, h, nextTick, ref, type Component } from "vue";
import { paymentsApi } from "@/api";
import ReceiptViewer from "./ReceiptViewer.vue";

const payment = (mimeType: string): Payment => ({
  id: "p1",
  contractId: "c1",
  referenceMonth: "2026-10",
  paidOn: "2026-10-05",
  amountCents: 18000,
  method: "pix",
  note: null,
  receipt: {
    mimeType,
    originalName: "pix.png",
    sizeBytes: 2048,
  } as Payment["receipt"],
  agreementId: null,
  acknowledgedAt: null,
  createdBy: "u1",
  createdAt: "2026-10-05T12:00:00Z",
});

/** The Sheet is a modal <dialog>; the zoom lives in its content, so render the slots inline. */
const SheetStub = { template: "<div><slot /><slot name='footer' /></div>" };

async function setup(mimeType = "image/png") {
  vi.spyOn(paymentsApi, "receipt").mockResolvedValue({
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: mimeType }),
    filename: "pix.png",
  });
  const open = ref(true);
  const Host = defineComponent(
    () => () =>
      h(ReceiptViewer as unknown as Component, {
        open: open.value,
        "onUpdate:open": (v: boolean) => (open.value = v),
        payment: payment(mimeType),
      }),
  );
  const wrapper = mount(Host, {
    global: { stubs: { Sheet: SheetStub, Tooltip: { template: "<slot />" } } },
    attachTo: document.body,
  });
  await flushPromises();
  return Object.assign(wrapper, { open });
}

const pct = (w: Awaited<ReturnType<typeof setup>>) => w.get(".rv__pct").text();
const key = (k: string, init: KeyboardEventInit = {}) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));

afterEach(() => vi.restoreAllMocks());

describe("ReceiptViewer zoom", () => {
  it("zooms an image in and out with the buttons and fits it back", async () => {
    const w = await setup();
    expect(pct(w)).toBe("100%");
    expect(w.get("[aria-label='Diminuir (-)']").attributes("disabled")).toBeDefined();

    await w.get("[aria-label='Ampliar (+)']").trigger("click");
    expect(pct(w)).toBe("125%");
    expect(w.get(".rv__img").attributes("style")).toContain("scale(1.25)");
    expect(w.get(".rv__stage").classes()).toContain("is-zoomed");

    await w.get("[aria-label='Diminuir (-)']").trigger("click");
    expect(pct(w)).toBe("100%");

    await w.get("[aria-label='Ampliar (+)']").trigger("click");
    await w.get("[aria-label='Ajustar à tela (0)']").trigger("click");
    expect(pct(w)).toBe("100%");
    w.unmount();
  });

  it("answers + and - on the keyboard, and 0 to fit", async () => {
    const w = await setup();
    key("+");
    key("+");
    await w.vm.$nextTick();
    expect(pct(w)).toBe("156%");
    key("-");
    await w.vm.$nextTick();
    expect(pct(w)).toBe("125%");
    key("0");
    await w.vm.$nextTick();
    expect(pct(w)).toBe("100%");
    w.unmount();
  });

  it("zooms with ctrl or cmd + wheel, and leaves a plain wheel to scroll", async () => {
    const w = await setup();
    const stage = w.get(".rv__stage");
    await stage.trigger("wheel", { deltaY: -100 });
    expect(pct(w)).toBe("100%");
    await stage.trigger("wheel", { deltaY: -200, ctrlKey: true });
    expect(pct(w)).toBe("135%");
    await stage.trigger("wheel", { deltaY: 400, metaKey: true });
    expect(pct(w)).toBe("100%");
    w.unmount();
  });

  it("stops listening to the keyboard once closed", async () => {
    const w = await setup();
    w.open.value = false;
    await nextTick();
    key("+");
    await w.vm.$nextTick();
    expect(w.get(".rv__pct").text()).toBe("100%");
    w.unmount();
  });

  it("leaves PDFs to the reader's own zoom", async () => {
    const w = await setup("application/pdf");
    expect(w.find(".rv__tools").exists()).toBe(false);
    expect(w.get(".rv__hint").text()).toContain("zoom do leitor");
    w.unmount();
  });
});
