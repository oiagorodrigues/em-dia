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
  nightBonus: false,
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
  c: Contract = contract,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: "u1", role } as PublicUser;
  return mount(DayEditor, {
    props: { open: true, date, entry, contract: c, today: TODAY },
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
let list: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  upsert = vi.spyOn(entriesApi, "upsert").mockResolvedValue({ entry: savedEntry });
  create = vi.spyOn(paymentsApi, "create").mockResolvedValue({ payment: { id: "p1" } } as never);
  advances = vi.spyOn(paymentsApi, "advances").mockResolvedValue({ advances: [] });
  list = vi.spyOn(paymentsApi, "list").mockResolvedValue({ payments: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const toggle = (label: string) =>
  [...document.querySelectorAll<HTMLInputElement>('input[role="switch"]')].find((el) =>
    el.closest("label")?.textContent?.includes(label),
  ) ?? null;
const payToggle = () => toggle("Pagar este dia");
const moneyInput = () => document.querySelector<HTMLInputElement>("input.money__input");
const moneyInputs = () => [...document.querySelectorAll<HTMLInputElement>("input.money__input")];
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
    expect(document.querySelector<HTMLInputElement>("#day-editor .df__input")!.disabled).toBe(
      false,
    );
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
      checkOutDate: null,
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

  it("is offered on a past day, with an editable date between that day and today", async () => {
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    payToggle()!.click();
    await flushPromises();
    const dateInput = document.querySelector<HTMLInputElement>("#day-editor .df__input")!;
    expect(dateInput.disabled).toBe(false);
    expect(moneyInput()!.value).toBe("180,00");
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    const [, form] = create.mock.calls[0] as [string, FormData];
    expect(form.get("referenceMonth")).toBe("2026-09");
    expect(form.get("paidOn")).toBe(TODAY);
    expect(form.get("amountCents")).toBe("18000");
    wrapper.unmount();
  });

  it("is not offered on a future day", async () => {
    const wrapper = setup("employer", null, "2026-10-08");
    await flushPromises();
    expect(payToggle()).toBeNull();
    wrapper.unmount();
  });

  it("pays a day already recorded without saving it again, so its confirmation stays", async () => {
    const confirmed = {
      date: TODAY,
      status: "worked",
      checkIn: "08:00",
      checkOut: "16:00",
      checkOutDate: null,
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
  /** The payment switches: pagar and abater, not "saiu em outro dia". */
  const switches = () =>
    [...document.querySelectorAll<HTMLInputElement>('input[role="switch"]')].filter(
      (el) => !el.closest("label")?.textContent?.includes("Saiu em outro dia"),
    );
  const abateToggle = () => toggle("Abater do adiantamento");

  it("is offered only while an adiantamento is open", async () => {
    advances.mockResolvedValue({ advances: [advance("a0", "2026-09-01", 10000, 0)] });
    const wrapper = setup();
    await flushPromises();
    expect(switches()).toHaveLength(2);
    expect(abateToggle()).toBeNull();
    wrapper.unmount();
  });

  it("is offered on a past day next to paying it", async () => {
    advances.mockResolvedValue({ advances: [advance("a1", "2026-09-10", 36000, 36000)] });
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    expect(switches()).toHaveLength(3);
    expect(document.body.textContent).toContain("Abater do adiantamento");
    expect(document.body.textContent).toContain("Pagar este dia");
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

  const moneyValues = () => moneyInputs().map((el) => el.value);
  const type = async (el: HTMLInputElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event("input"));
    await flushPromises();
  };
  const formsOf = (): FormData[] => create.mock.calls.map((c: unknown[]) => c[1] as FormData);

  it("pays the rest of the day after abating and discounting, in order", async () => {
    advances.mockResolvedValue({ advances: [advance("a1", "2026-09-10", 36000, 36000)] });
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    payToggle()!.click();
    abateToggle()!.click();
    await flushPromises();
    // Abating defaults to the whole day, so nothing is left to pay yet.
    const [, abateMoney] = moneyValues();
    await type(moneyInputs()[1]!, "50,00");
    expect(abateMoney).toBe("180,00");
    toggle("Descontar um valor")!.click();
    await flushPromises();
    expect(
      [...document.querySelectorAll<HTMLInputElement>("input.input")].some(
        (el) => el.value === "Desconto do dia 30/09",
      ),
    ).toBe(true);
    await type(moneyInputs()[2]!, "10,00");
    expect(moneyInputs()[0]!.value).toBe("120,00");
    expect(document.body.textContent?.replaceAll(String.fromCharCode(160), " ")).toContain(
      "Abate R$ 50,00, desconta R$ 10,00, paga R$ 120,00.",
    );
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();

    const forms = formsOf();
    expect(forms.map((f) => f.get("kind"))).toEqual(["pay", "deduction", "pay"]);
    expect(forms.map((f) => f.get("amountCents"))).toEqual(["5000", "1000", "12000"]);
    expect(forms[0]!.get("method")).toBe("compensation");
    expect(forms[0]!.get("advanceId")).toBe("a1");
    expect(forms[1]!.get("method")).toBeNull();
    expect(forms[1]!.get("referenceMonth")).toBe("2026-09");
    expect(forms[1]!.get("note")).toBe("Desconto do dia 30/09");
    expect(forms[2]!.get("method")).toBe("pix");
    expect(forms[2]!.get("paidOn")).toBe(TODAY);
    wrapper.unmount();
  });

  it("saves with no money payment when abating and discounting cover the day", async () => {
    advances.mockResolvedValue({ advances: [advance("a1", "2026-09-10", 36000, 36000)] });
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    payToggle()!.click();
    abateToggle()!.click();
    await flushPromises();
    await type(moneyInputs()[1]!, "170,00");
    toggle("Descontar um valor")!.click();
    await flushPromises();
    await type(moneyInputs()[2]!, "10,00");
    expect(moneyInputs()[0]!.value).toBe("0,00");
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(formsOf().map((f) => f.get("kind"))).toEqual(["pay", "deduction"]);
    expect(formsOf().map((f) => f.get("method"))).toEqual(["compensation", null]);
    wrapper.unmount();
  });

  it("discounts alone, on a salaried contract, without prefilling an amount", async () => {
    const monthly = { ...contract, payType: "monthly", rateCents: 250000 } as Contract;
    const wrapper = setup("employer", null, "2026-09-30", monthly);
    await flushPromises();
    toggle("Descontar um valor")!.click();
    await flushPromises();
    await type(moneyInputs()[0]!, "30,00");
    expect(document.querySelector('button[form="day-editor"]')!.textContent).toContain(
      "Anotar e descontar",
    );
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(formsOf().map((f) => f.get("kind"))).toEqual(["deduction"]);
    wrapper.unmount();
  });

  it("says what was done when a later payment fails, and does not repeat the earlier one", async () => {
    advances.mockResolvedValue({ advances: [advance("a1", "2026-09-10", 36000, 36000)] });
    create
      .mockResolvedValueOnce({ payment: { id: "p1" } } as never)
      .mockRejectedValueOnce(new Error("boom"));
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    payToggle()!.click();
    abateToggle()!.click();
    await flushPromises();
    await type(moneyInputs()[1]!, "50,00");
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(create).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("update:open")?.at(-1)).not.toEqual([false]);
    expect(abateToggle()!.checked).toBe(false);
    expect(payToggle()!.checked).toBe(true);
    wrapper.unmount();
  });

  it("does not save the day when a desconto has no amount", async () => {
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    payToggle()!.click();
    await flushPromises();
    toggle("Descontar um valor")!.click();
    await flushPromises();
    await type(moneyInputs()[1]!, "0,00");
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(upsert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("DayEditor plantão", () => {
  const shift = {
    ...contract,
    payType: "shift",
    rateCents: 30000,
    expectedStart: "08:00",
    expectedEnd: "08:00",
    nightBonus: true,
  } as Contract;

  it("opens a past plantão as 24h, out the next day, and saves the check-out date", async () => {
    const wrapper = setup("employer", null, "2026-10-02", shift);
    await flushPromises();
    expect(document.body.textContent).toContain("Saiu em outro dia");
    expect(document.body.textContent).toContain("24h");
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    const [, date, body] = upsert.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(date).toBe("2026-10-02");
    expect(body).toMatchObject({
      checkIn: "08:00",
      checkOut: "08:00",
      checkOutDate: "2026-10-03",
      breakMinutes: 0,
    });
    wrapper.unmount();
  });

  it("leaves a plantão started today open, without a check-out", async () => {
    const wrapper = setup("employer", null, TODAY, shift);
    await flushPromises();
    submit().dispatchEvent(new Event("submit"));
    await flushPromises();
    const [, , body] = upsert.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(body).toMatchObject({ checkIn: "08:00", checkOut: null, checkOutDate: null });
    wrapper.unmount();
  });
});

describe("DayEditor day already abated", () => {
  it("shows the abatement switched on, not a fresh abate switch", async () => {
    advances.mockResolvedValue({ advances: [advance("a1", "2026-09-10", 36000, 18000)] });
    list.mockResolvedValue({
      payments: [
        {
          id: "p9",
          contractId: "c1",
          kind: "pay",
          method: "compensation",
          advanceId: "a1",
          referenceMonth: "2026-09",
          paidOn: "2026-09-30",
          amountCents: 18000,
        } as Payment,
      ],
    });
    const wrapper = setup("employer", null, "2026-09-30");
    await flushPromises();
    const sw = toggle("Abatido do adiantamento");
    expect(sw?.checked).toBe(true);
    expect(sw?.disabled).toBe(true);
    expect(document.body.textContent?.replaceAll(String.fromCharCode(160), " ")).toContain(
      "R$ 180,00 abatidos do adiantamento de 10/09/2026",
    );
    expect(toggle("Abater do adiantamento")).toBeNull();
    wrapper.unmount();
  });
});
