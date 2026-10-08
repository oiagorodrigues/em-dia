import type { Contract, Payment, PublicUser, WorkEntry } from "@emdia/shared";
import { PiniaColada } from "@pinia/colada";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { entriesApi, paymentsApi } from "@/api";
import { queryCacheOptions } from "@/api/query.ts";
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

const TODAY = "2026-10-07";

function setup(
  role: "employer" | "worker" = "employer",
  entry: WorkEntry | null = null,
  date = TODAY,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: "u1", role } as PublicUser;
  return mount(DayEditor, {
    props: { open: true, date, entry, contract, today: TODAY },
    attachTo: document.body,
    global: { plugins: [pinia, [PiniaColada, queryCacheOptions({ retry: false })]] },
  });
}

function advance(id: string, paidOn: string, amountCents: number, remainingCents: number) {
  return {
    id,
    contractId: "c1",
    kind: "advance",
    paidOn,
    amountCents,
    settledCents: amountCents - remainingCents,
    remainingCents,
  } as Payment;
}

let upsert: ReturnType<typeof vi.spyOn>;
let create: ReturnType<typeof vi.spyOn>;
let advances: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  upsert = vi.spyOn(entriesApi, "upsert").mockResolvedValue({ entry: savedEntry });
  create = vi.spyOn(paymentsApi, "create").mockResolvedValue({ payment: { id: "p1" } } as never);
  advances = vi.spyOn(paymentsApi, "advances").mockResolvedValue({ advances: [] });
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

  it("registers the day and its payment, paid today, with the diária prefilled", async () => {
    const wrapper = setup();
    await flushPromises();
    payToggle()!.click();
    await flushPromises();
    expect(moneyInput()!.value).toBe("180,00");
    expect(document.querySelector<HTMLInputElement>("#day-editor .df__input")!.disabled).toBe(true);
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();

    expect(upsert).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(upsert.mock.invocationCallOrder[0]!).toBeLessThan(create.mock.invocationCallOrder[0]!);
    const [contractId, form] = create.mock.calls[0] as [string, FormData];
    expect(contractId).toBe("c1");
    expect(form.get("referenceMonth")).toBe("2026-10");
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

  it("prices a longer day in proportion to the diária", async () => {
    const long = {
      date: TODAY,
      status: "worked",
      checkIn: "08:00",
      checkOut: "19:00",
      breakMinutes: 60,
      minutes: 600,
      note: null,
      createdBy: "u1",
      createdByRole: "employer",
      confirmedAt: null,
      updatedAt: "2026-10-07T20:00:00Z",
    } as WorkEntry;
    const wrapper = setup("employer", long);
    await flushPromises();
    payToggle()!.click();
    await flushPromises();
    // 08:00 to 16:00 less the 1h break is the agreed 7h; this day is 10h: 10/7 of R$ 180.
    expect(moneyInput()!.value).toBe("257,14");
    expect(document.body.textContent).toContain("em proporção");
    wrapper.unmount();
  });

  it("is offered only on the day itself", async () => {
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    expect(payToggle()).toBeNull();
    expect(document.body.textContent).not.toContain("Pagar este dia");
    wrapper.unmount();
  });

  it("pays a day already recorded without saving it again, so its confirmation stays", async () => {
    const confirmed = {
      date: TODAY,
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
    expect(advances).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("DayEditor abate from an adiantamento", () => {
  const switches = () => [...document.querySelectorAll<HTMLInputElement>('input[role="switch"]')];
  const abateToggle = () => switches().at(-1);

  it("is offered only while an adiantamento is open", async () => {
    advances.mockResolvedValue({ advances: [advance("a0", "2026-09-01", 10000, 0)] });
    const wrapper = setup();
    await flushPromises();
    expect(switches()).toHaveLength(1);
    wrapper.unmount();
  });

  it("is offered on a past day, where paying is not", async () => {
    advances.mockResolvedValue({ advances: [advance("a1", "2026-09-10", 36000, 36000)] });
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    expect(switches()).toHaveLength(1);
    expect(document.body.textContent).toContain("Abater do adiantamento");
    expect(document.body.textContent).not.toContain("Pagar este dia");
    wrapper.unmount();
  });

  it("abates the day from the oldest open adiantamento, capped at what remains", async () => {
    advances.mockResolvedValue({
      advances: [
        advance("new", "2026-09-20", 50000, 50000),
        advance("old", "2026-09-10", 36000, 10000),
      ],
    });
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    expect(document.body.textContent).toContain("Abater do adiantamento");
    abateToggle()!.click();
    await flushPromises();
    expect(document.body.textContent?.replaceAll(String.fromCharCode(160), " ")).toContain(
      "Restam R$ 100,00 de R$ 360,00",
    );
    expect(moneyInput()!.value).toBe("100,00");
    expect(document.querySelector('button[form="day-editor"]')!.textContent).toContain(
      "Anotar e abater",
    );
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();

    expect(upsert).toHaveBeenCalledOnce();
    const [, form] = create.mock.calls[0] as [string, FormData];
    expect(form.get("kind")).toBe("pay");
    expect(form.get("method")).toBe("compensation");
    expect(form.get("advanceId")).toBe("old");
    expect(form.get("amountCents")).toBe("10000");
    expect(form.get("referenceMonth")).toBe("2026-09");
    expect(form.get("paidOn")).toBe("2026-09-30");
    wrapper.unmount();
  });

  it("does not save the day when the amount passes what remains", async () => {
    advances.mockResolvedValue({ advances: [advance("a1", "2026-09-10", 36000, 10000)] });
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    abateToggle()!.click();
    await flushPromises();
    const money = moneyInput()!;
    money.value = "150,00";
    money.dispatchEvent(new Event("input"));
    await flushPromises();
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(upsert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("só tem");
    wrapper.unmount();
  });

  it("turns paying off when abating is on", async () => {
    advances.mockResolvedValue({ advances: [advance("a1", "2026-09-10", 36000, 36000)] });
    const wrapper = setup();
    await flushPromises();
    payToggle()!.click();
    await flushPromises();
    abateToggle()!.click();
    await flushPromises();
    expect(switches()[0]!.checked).toBe(false);
    expect(moneyInput()!.value).toBe("180,00");
    wrapper.unmount();
  });
});
