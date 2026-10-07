import type { Contract, PublicUser, WorkEntry } from "@emdia/shared";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { entriesApi, paymentsApi } from "@/api";
import { useAuthStore } from "@/stores/auth.ts";
import DayEditor from "./DayEditor.vue";

const contract = {
  id: "c1",
  workerName: "Rosa",
  employerName: "Ana",
  workerId: "w1",
  payType: "daily",
  rateCents: 18000,
  expectedStart: "08:00",
  expectedEnd: "16:00",
  status: "active",
  archivedAt: null,
  startedOn: "2026-08-01",
  endedOn: null,
} as unknown as Contract;

const savedEntry = { date: "2026-09-30", status: "worked" } as WorkEntry;

function setup(role: "employer" | "worker" = "employer", entry: WorkEntry | null = null) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u1", role } as PublicUser;
  return mount(DayEditor, {
    props: { open: true, date: "2026-09-30", entry, contract, today: "2026-10-07" },
    attachTo: document.body,
  });
}

let upsert: ReturnType<typeof vi.spyOn>;
let create: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  upsert = vi.spyOn(entriesApi, "upsert").mockResolvedValue({ entry: savedEntry });
  create = vi.spyOn(paymentsApi, "create").mockResolvedValue({ payment: { id: "p1" } } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const payToggle = () => document.querySelector<HTMLInputElement>('input[role="switch"]');
const moneyInput = () => document.querySelector<HTMLInputElement>("input.money__input");
const submit = () => document.querySelector<HTMLFormElement>("#day-editor")!;

describe("DayEditor payment section", () => {
  it("stays closed until the employer asks to pay the day", async () => {
    const wrapper = setup();
    await flushPromises();
    expect(payToggle()).not.toBeNull();
    expect(moneyInput()).toBeNull();
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(upsert).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("registers the day and its payment, in the day's month, with the diária prefilled", async () => {
    const wrapper = setup();
    await flushPromises();
    payToggle()!.click();
    await flushPromises();
    expect(moneyInput()!.value).toBe("180,00");
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();

    expect(upsert).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(upsert.mock.invocationCallOrder[0]!).toBeLessThan(create.mock.invocationCallOrder[0]!);
    const [contractId, form] = create.mock.calls[0] as [string, FormData];
    expect(contractId).toBe("c1");
    expect(form.get("referenceMonth")).toBe("2026-09");
    expect(form.get("paidOn")).toBe("2026-10-07");
    expect(form.get("amountCents")).toBe("18000");
    expect(form.get("method")).toBe("pix");
    expect(wrapper.emitted("paid")).toHaveLength(1);
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it("does not save the day when the payment is invalid", async () => {
    const wrapper = setup();
    await flushPromises();
    payToggle()!.click();
    await flushPromises();
    const money = moneyInput()!;
    money.value = "";
    money.dispatchEvent(new Event("input"));
    await flushPromises();
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(upsert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Informe o valor");
    wrapper.unmount();
  });

  it("pays a day already recorded without saving it again, so its confirmation stays", async () => {
    const confirmed = {
      date: "2026-09-30",
      status: "worked",
      checkIn: "08:00",
      checkOut: "16:00",
      breakMinutes: 60,
      minutes: 420,
      note: null,
      createdBy: "w1",
      createdByRole: "worker",
      confirmedAt: "2026-09-30T20:00:00Z",
      updatedAt: "2026-09-30T20:00:00Z",
    } as WorkEntry;
    const wrapper = setup("employer", confirmed);
    await flushPromises();
    payToggle()!.click();
    await flushPromises();
    expect(document.querySelector('button[form="day-editor"]')!.textContent).toContain("Pagar");
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(upsert).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("is not offered to the worker", async () => {
    const wrapper = setup("worker");
    await flushPromises();
    expect(payToggle()).toBeNull();
    wrapper.unmount();
  });
});
