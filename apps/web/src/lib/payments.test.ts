import type { Contract, Payment } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import {
  abatementLabel,
  advanceProgress,
  dayPaymentDraft,
  dayValueCents,
  formatSigned,
  matchesPaymentFilters,
  paymentFormData,
  paymentTotals,
  paymentYears,
  receivedStatus,
  type PaymentRow,
} from "./payments.ts";

describe("dayPaymentDraft", () => {
  it("refers to the worked day's month and prefills what the day is worth", () => {
    expect(dayPaymentDraft({ payType: "daily" }, "2026-09-30", "2026-10-07", 18000)).toEqual({
      kind: "pay",
      referenceMonth: "2026-09",
      paidOn: "2026-10-07",
      amountCents: 18000,
      method: "pix",
    });
  });

  it("leaves the amount empty for a salary", () => {
    for (const payType of ["biweekly", "monthly"] as const)
      expect(dayPaymentDraft({ payType }, "2026-10-06", "2026-10-07", 8000).amountCents).toBeNull();
  });
});

describe("dayValueCents", () => {
  const times = { expectedStart: "08:00", expectedEnd: "17:00" };
  const day = (minutes: number, breakMinutes = 60) => ({ minutes, breakMinutes });

  it("is the diária, the hours times the rate, or a thirtieth of the salary", () => {
    const rate = (payType: "daily" | "hourly" | "biweekly" | "monthly", rateCents: number) => ({
      payType,
      rateCents,
      ...times,
    });
    expect(dayValueCents(rate("daily", 18000), day(480))).toBe(18000);
    expect(dayValueCents(rate("hourly", 3000), day(450))).toBe(22500);
    expect(dayValueCents(rate("hourly", 3000), day(0))).toBeNull();
    expect(dayValueCents(rate("monthly", 240000), day(0))).toBe(8000);
    expect(dayValueCents(rate("biweekly", 120000), day(0))).toBe(8000);
  });

  it("prices a longer or shorter day in proportion to the diária", () => {
    const daily = { payType: "daily" as const, rateCents: 15000, ...times };
    // 08:00 to 17:00 less 1h of break is the agreed 8h: 12h is one and a half diárias.
    expect(dayValueCents(daily, day(720))).toBe(22500);
    expect(dayValueCents(daily, day(240))).toBe(7500);
    // The same break comes off the agreed times, so a shorter break is a longer day.
    expect(dayValueCents(daily, day(510, 30))).toBe(15000);
    expect(dayValueCents({ ...daily, expectedStart: null, expectedEnd: null }, day(720))).toBe(
      15000,
    );
  });
});

describe("paymentFormData", () => {
  const base = {
    kind: "pay" as const,
    referenceMonth: "2026-10",
    paidOn: "2026-10-07",
    amountCents: 18000,
    method: "pix" as const,
  };

  it("leaves empty optional fields out", () => {
    const form = paymentFormData({ ...base, note: null, agreementId: null }, null);
    expect([...form.keys()].sort()).toEqual([
      "amountCents",
      "kind",
      "method",
      "paidOn",
      "referenceMonth",
    ]);
  });

  it("sends note, agreement, advance and receipt when set", () => {
    const file = new File(["x"], "r.png", { type: "image/png" });
    const form = paymentFormData(
      { ...base, method: "compensation", note: "celular", agreementId: "a1", advanceId: "p1" },
      file,
    );
    expect(form.get("note")).toBe("celular");
    expect(form.get("agreementId")).toBe("a1");
    expect(form.get("advanceId")).toBe("p1");
    expect(form.get("receipt")).toBeInstanceOf(File);
  });

  it("sends a desconto without method or receipt", () => {
    const file = new File(["x"], "r.png", { type: "image/png" });
    const form = paymentFormData({ ...base, kind: "deduction", method: null }, file);
    expect(form.get("kind")).toBe("deduction");
    expect(form.has("method")).toBe(false);
    expect(form.has("receipt")).toBe(false);
  });
});

function payment(extra: Partial<Payment> = {}): Payment {
  return {
    id: "p",
    contractId: "c",
    referenceMonth: "2026-09",
    paidOn: "2026-10-02",
    amountCents: 10000,
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

function row(id: string, contractId: string, extra: Partial<Payment> = {}): PaymentRow {
  return {
    contract: { id: contractId, startedOn: "2025-03-01" } as Contract,
    payment: payment({ id, contractId, ...extra }),
  };
}

const rows = [
  row("a", "c1"),
  row("b", "c2", { method: "cash", acknowledgedAt: "2026-10-03T00:00:00Z", amountCents: 5000 }),
  row("c", "c1", { kind: "deduction", method: null, amountCents: 2000 }),
  row("d", "c2", { kind: "advance", amountCents: 30000, settledCents: 0, remainingCents: 30000 }),
];

describe("matchesPaymentFilters", () => {
  it("keeps everything without filters", () => {
    expect(rows.filter((r) => matchesPaymentFilters(r, {}))).toHaveLength(4);
  });

  it("filters by person, type, method and acknowledgement", () => {
    const ids = (f: Parameters<typeof matchesPaymentFilters>[1]) =>
      rows.filter((r) => matchesPaymentFilters(r, f)).map((r) => r.payment.id);
    expect(ids({ pessoa: "c2" })).toEqual(["b", "d"]);
    expect(ids({ tipo: "deduction" })).toEqual(["c"]);
    expect(ids({ forma: "pix" })).toEqual(["a", "d"]);
    expect(ids({ recebido: "sim" })).toEqual(["b"]);
    // A desconto is never waiting for a "recebi".
    expect(ids({ recebido: "nao" })).toEqual(["a", "d"]);
  });
});

describe("receivedStatus", () => {
  it("tells the worker's recebi from the employer closing the payment", () => {
    expect(receivedStatus({ acknowledgedAt: null, acknowledgedByRole: null }).label).toBe(
      "Aguardando",
    );
    expect(receivedStatus({ acknowledgedAt: "x", acknowledgedByRole: "worker" }).label).toBe(
      "Recebido",
    );
    expect(receivedStatus({ acknowledgedAt: "x", acknowledgedByRole: "employer" })).toEqual({
      label: "Concluído",
      tone: "brand",
      done: true,
    });
  });
});

describe("paymentTotals", () => {
  it("sums what counts as paid and counts acknowledgements", () => {
    expect(paymentTotals(rows)).toEqual({ count: 4, cents: 15000, money: 3, acknowledged: 1 });
  });
});

describe("kinds in the list", () => {
  const plain = (s: string) => s.replaceAll(String.fromCharCode(160), " ");

  it("shows a desconto as a negative amount", () => {
    expect(plain(formatSigned({ kind: "deduction", amountCents: 5000 }))).toBe("− R$ 50,00");
    expect(plain(formatSigned({ kind: "bonus", amountCents: 5000 }))).toBe("R$ 50,00");
  });

  it("says what is left of an adiantamento", () => {
    expect(plain(advanceProgress({ amountCents: 36000, remainingCents: 18000 }))).toBe(
      "Restam R$ 180,00 de R$ 360,00",
    );
    expect(plain(advanceProgress({ amountCents: 36000, remainingCents: 0 }))).toBe(
      "Todo abatido (R$ 360,00)",
    );
  });

  it("names the adiantamento an abatement pays down", () => {
    const advances = [{ id: "p1", paidOn: "2026-09-15" }];
    expect(abatementLabel({ advanceId: "p1" }, advances)).toBe("Adiantamento de 15/09/2026");
    expect(abatementLabel({ advanceId: null }, advances)).toBeNull();
  });
});

describe("paymentYears", () => {
  it("lists years from the oldest contract to this year, newest first", () => {
    expect(paymentYears([{ startedOn: "2024-05-01" }, { startedOn: "2026-01-01" }], 2026)).toEqual([
      2026, 2025, 2024,
    ]);
    expect(paymentYears([], 2026)).toEqual([2026]);
  });
});
