import type { Contract, PublicUser } from "@emdia/shared";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { contractsApi } from "@/api";
import { useAuthStore } from "@/stores/auth.ts";
import ContractEditSheet from "./ContractEditSheet.vue";

const base = {
  id: "c1",
  householdId: "h1",
  householdName: "Casa",
  employerId: "u1",
  employerName: "Ana",
  workerId: "w1",
  workerName: "Joana",
  workerEmail: "joana@exemplo.com",
  workerPhone: "(11) 98765-4321",
  workerPixKey: null,
  contactEmail: "antigo@exemplo.com",
  contactPhone: null,
  occupation: "diarista",
  payType: "daily",
  rateCents: 18000,
  schedule: {
    kind: "weekly",
    weekdays: [2, 5],
    everyWeeks: 1,
    monthDays: [],
    visitsPerMonth: null,
  },
  deductAbsences: false,
  nightBonus: false,
  expectedStart: "08:00",
  expectedEnd: "16:00",
  startedOn: "2026-08-01",
  endedOn: null,
  status: "active",
  archivedAt: null,
  createdAt: "2026-08-01T00:00:00Z",
} as Contract;

function render(patch: Partial<Contract> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: "u1", name: "Ana", role: "employer" } as PublicUser;
  return mount(ContractEditSheet, {
    props: { open: true, contract: { ...base, ...patch } },
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
}

const body = () => document.body;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("ContractEditSheet", () => {
  it("shows the e-mail and phone the worker registered, not the typed contact", async () => {
    const w = render();
    await flushPromises();
    expect(body().textContent).toContain("Contato de Joana");
    expect(body().querySelector("a[href^='mailto:']")?.textContent).toBe("joana@exemplo.com");
    expect(body().querySelector("a[href^='tel:']")?.getAttribute("href")).toBe("tel:11987654321");
    expect(body().querySelector("input[type='email']")).toBeNull();
    w.unmount();
  });

  it("says when the worker left a field empty", async () => {
    const w = render({ workerPhone: null });
    await flushPromises();
    expect(body().textContent).toContain("não informado");
    w.unmount();
  });

  it("keeps the typed contact editable before the worker joins", async () => {
    const w = render({ workerId: null, workerEmail: null, workerPhone: null });
    await flushPromises();
    expect(body().textContent).not.toContain("Contato de Joana");
    expect(body().querySelector("input[type='email']")).not.toBeNull();
    w.unmount();
  });

  it("saves the changes, hands back the contract and closes", async () => {
    const updated = { ...base, rateCents: 20000 };
    const update = vi.spyOn(contractsApi, "update").mockResolvedValue({ contract: updated });
    const w = render();
    await flushPromises();
    body().querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(update).toHaveBeenCalledWith("c1", expect.objectContaining({ workerName: "Joana" }));
    expect(w.emitted("saved")).toEqual([[updated]]);
    expect(w.emitted("update:open")?.at(-1)).toEqual([false]);
    w.unmount();
  });
});
