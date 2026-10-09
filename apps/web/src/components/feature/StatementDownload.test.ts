import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ApiError, contractsApi } from "@/api";
import { useToastStore } from "@/stores/toast.ts";
import StatementDownload from "./StatementDownload.vue";

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(StatementDownload, {
    props: { contractId: "c1", month: "2026-10" },
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
}

async function choose(wrapper: ReturnType<typeof setup>, label: string) {
  const trigger = wrapper.get("button[aria-haspopup='menu']");
  expect(trigger.text()).toContain("Baixar");
  await trigger.trigger("click");
  const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (el) => el.textContent?.trim() === label,
  );
  expect(item, `menu item "${label}"`).toBeTruthy();
  item!.click();
  await flushPromises();
}

const file = (name: string) => ({ blob: new Blob(["x"]), filename: name });
let saved: string[];

beforeEach(() => {
  saved = [];
  URL.createObjectURL = vi.fn(() => "blob:statement");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("StatementDownload", () => {
  it("offers PDF and CSV and downloads the chosen format", async () => {
    const pdf = vi
      .spyOn(contractsApi, "statementPdf")
      .mockResolvedValue(file("extrato-2026-10.pdf"));
    const csv = vi
      .spyOn(contractsApi, "statementCsv")
      .mockResolvedValue(file("extrato-2026-10.csv"));
    const wrapper = setup();

    await choose(wrapper, "PDF");
    expect(pdf).toHaveBeenCalledWith("c1", "2026-10");
    expect(csv).not.toHaveBeenCalled();

    await choose(wrapper, "Planilha (CSV)");
    expect(csv).toHaveBeenCalledWith("c1", "2026-10");
    expect(saved).toEqual(["extrato-2026-10.pdf", "extrato-2026-10.csv"]);
    wrapper.unmount();
  });

  it("disables the trigger while downloading and shows a toast on error", async () => {
    let fail!: (e: unknown) => void;
    vi.spyOn(contractsApi, "statementPdf").mockReturnValue(
      new Promise((_, reject) => (fail = reject)),
    );
    const wrapper = setup();
    await choose(wrapper, "PDF");
    const trigger = wrapper.get("button[aria-haspopup='menu']");
    expect(trigger.attributes("aria-busy")).toBe("true");
    expect(trigger.attributes("disabled")).toBeDefined();

    fail(new ApiError(500, "INTERNAL", "Não deu para gerar o extrato."));
    await flushPromises();
    expect(trigger.attributes("disabled")).toBeUndefined();
    expect(useToastStore().toasts.at(-1)).toMatchObject({
      message: "Não deu para gerar o extrato.",
    });
    expect(saved).toEqual([]);
    wrapper.unmount();
  });
});
