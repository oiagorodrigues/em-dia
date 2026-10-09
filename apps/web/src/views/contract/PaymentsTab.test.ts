import { formatCents, type Contract, type Payment, type PublicUser } from "@emdia/shared";
import { PiniaColada } from "@pinia/colada";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { computed, defineComponent, h, ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { agreementsApi, ApiError, paymentsApi } from "@/api";
import { queryCacheOptions } from "@/api/query.ts";
import { provideContract } from "@/composables/contractContext.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { useToastStore } from "@/stores/toast.ts";
import PaymentsTab from "./PaymentsTab.vue";

const contract = {
  id: "c1",
  workerName: "Rosa",
  status: "active",
  archivedAt: null,
  startedOn: "2026-01-05",
  endedOn: null,
} as unknown as Contract;

function payment(id: string, extra: Partial<Payment> = {}): Payment {
  return {
    id,
    contractId: "c1",
    referenceMonth: "2026-09",
    paidOn: "2026-10-02",
    amountCents: 18000,
    kind: "pay",
    method: "pix",
    note: null,
    receipt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    acknowledgedByRole: null,
    createdBy: "u",
    createdAt: "2026-10-02T00:00:00Z",
    agreementId: null,
    advanceId: null,
    settledCents: null,
    remainingCents: null,
    ...extra,
  };
}

const PAYMENTS = [
  payment("p1", { paidOn: "2026-10-04" }),
  payment("p2", { paidOn: "2026-10-03", acknowledgedAt: "2026-10-03T12:00:00Z" }),
  payment("p3", { paidOn: "2026-10-02", kind: "deduction", method: null, amountCents: 2000 }),
  payment("p4", { paidOn: "2026-10-01" }),
  payment("p5", {
    paidOn: "2026-09-20",
    kind: "advance",
    amountCents: 36000,
    settledCents: 18000,
    remainingCents: 18000,
  }),
];

async function setup(role: PublicUser["role"] = "employer") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: !query.includes("reduce") && !query.includes("coarse"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: "u1", name: "Ana", role } as PublicUser;
  vi.spyOn(paymentsApi, "list").mockResolvedValue({ payments: PAYMENTS });
  vi.spyOn(paymentsApi, "advances").mockResolvedValue({ advances: [] });
  vi.spyOn(agreementsApi, "list").mockResolvedValue({ agreements: [] });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:rest(.*)*", component: { render: () => null } }],
  });
  await router.push("/equipe/c1/pagamentos?pg_ano=2026");
  const Host = defineComponent(() => {
    provideContract({
      contract: ref(contract),
      month: computed(() => "2026-10"),
      currentMonth: "2026-10",
      setMonth: () => {},
      replaceContract: () => {},
      askRemove: () => {},
      edit: () => {},
      restore: async () => {},
      restoring: ref(false),
    });
    return () => h(PaymentsTab);
  });
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [router, pinia, [PiniaColada, queryCacheOptions({ retry: false })]],
      stubs: {
        transition: false,
        "transition-group": false,
        ReceiptViewer: true,
        PaymentEditSheet: true,
        AdvancesPanel: true,
      },
    },
  });
  await flushPromises();
  return { wrapper, toast: useToastStore() };
}

const button = (w: Awaited<ReturnType<typeof setup>>["wrapper"], text: string) =>
  w.findAll(".dt__bulk button").find((b) => b.text() === text)!;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("PaymentsTab bulk actions", () => {
  it("labels each checkbox with what the row is", async () => {
    const { wrapper } = await setup();
    const labels = wrapper.findAll("tbody .dt__check").map((l) => l.text());
    expect(labels[0]).toBe(`Selecionar pagamento de 04/10/2026, ${formatCents(18000)}`);
  });

  it("concludes only the payments still waiting and sums it up in one toast", async () => {
    const { wrapper, toast } = await setup();
    const confirm = vi.spyOn(paymentsApi, "confirm").mockImplementation(async (_c, id) => {
      if (id === "p4") throw new ApiError(409, "CONFLICT", "Contrato encerrado");
      return { payment: { ...PAYMENTS.find((p) => p.id === id)!, acknowledgedAt: "now" } };
    });

    await wrapper.get("thead input[type='checkbox']").setValue(true);
    expect(wrapper.get(".dt__bulk").text()).toContain("5 selecionados");
    await button(wrapper, "Marcar como concluído").trigger("click");
    await flushPromises();

    expect(confirm.mock.calls.map((c) => c[1]).sort()).toEqual(["p1", "p4", "p5"]);
    expect(toast.toasts.at(-1)?.message).toBe(
      "2 pagamentos concluídos; 2 ficaram de fora (já concluídos ou sem dinheiro entregue); 1 não deu: Contrato encerrado.",
    );
    // The one that failed stays selected for another try.
    expect(wrapper.get(".dt__bulk").text()).toContain("1 selecionado");
  });

  it("deletes after a confirmation that counts them, keeping an adiantamento with days abated", async () => {
    const { wrapper, toast } = await setup();
    const remove = vi.spyOn(paymentsApi, "remove").mockResolvedValue(undefined);

    await wrapper.get("thead input[type='checkbox']").setValue(true);
    await button(wrapper, "Excluir").trigger("click");
    await flushPromises();
    const dialog = document.body.querySelector("dialog[open]")!;
    expect(dialog.textContent).toContain("Excluir 5 lançamentos?");
    expect(dialog.textContent).toContain("1 adiantamento com dias abatidos fica.");
    const confirmButton = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Excluir 4 lançamentos",
    )!;
    confirmButton.click();
    await flushPromises();

    expect(remove.mock.calls.map((c) => c[1]).sort()).toEqual(["p1", "p2", "p3", "p4"]);
    expect(toast.toasts.at(-1)?.message).toBe(
      "4 lançamentos excluídos; 1 ficou de fora (adiantamento com dias abatidos).",
    );
    expect(wrapper.findAll("tbody tr:not(.dt-row-leave-active)")).toHaveLength(1);
  });

  it("edits the common fields, sending each payment only what changes for it", async () => {
    const { wrapper, toast } = await setup();
    const update = vi.spyOn(paymentsApi, "update").mockImplementation(async (_c, id, body) => ({
      payment: { ...PAYMENTS.find((p) => p.id === id)!, ...body } as Payment,
    }));

    await wrapper.get("thead input[type='checkbox']").setValue(true);
    await button(wrapper, "Editar").trigger("click");
    await flushPromises();
    const form = document.body.querySelector<HTMLFormElement>("#payment-bulk-form")!;
    const cash = form.querySelector<HTMLInputElement>("input[type='radio'][value='cash']")!;
    cash.checked = true;
    cash.dispatchEvent(new Event("change"));
    form.dispatchEvent(new Event("submit"));
    await flushPromises();

    const calls = update.mock.calls.map((c) => [c[1], c[2]] as const);
    expect(calls.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
      ["p1", { method: "cash" }],
      ["p2", { method: "cash" }],
      ["p4", { method: "cash" }],
      ["p5", { method: "cash" }],
    ]);
    expect(toast.toasts.at(-1)?.message).toBe(
      "4 lançamentos atualizados; 1 ficou de fora (já estavam assim ou o campo não vale para eles).",
    );
  });

  it("lets the worker say recebi to many at once", async () => {
    const { wrapper, toast } = await setup("worker");
    const ack = vi.spyOn(paymentsApi, "acknowledge").mockImplementation(async (_c, id) => ({
      payment: { ...PAYMENTS.find((p) => p.id === id)!, acknowledgedAt: "now" },
    }));
    expect(wrapper.findAll(".dt__bulk button").some((b) => b.text() === "Excluir")).toBe(false);

    await wrapper.get("thead input[type='checkbox']").setValue(true);
    expect(button(wrapper, "Excluir")).toBeUndefined();
    await button(wrapper, "Recebi").trigger("click");
    await flushPromises();

    expect(ack.mock.calls.map((c) => c[1]).sort()).toEqual(["p1", "p4", "p5"]);
    expect(toast.toasts.at(-1)?.message).toBe(
      "3 recebimentos confirmados; 2 ficaram de fora (já confirmados ou sem dinheiro entregue).",
    );
  });
});
