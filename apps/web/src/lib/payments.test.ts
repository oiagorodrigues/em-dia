import type { Contract, Payment } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import {
  dayPaymentDraft,
  matchesPaymentFilters,
  paymentFormData,
  paymentTotals,
  paymentYears,
  receivedStatus,
  type PaymentRow,
} from "./payments.ts";

describe("dayPaymentDraft", () => {
  it("refers to the worked day's month and prefills one diária", () => {
    expect(
      dayPaymentDraft({ payType: "daily", rateCents: 18000 }, "2026-09-30", "2026-10-07"),
    ).toEqual({
      referenceMonth: "2026-09",
      paidOn: "2026-10-07",
      amountCents: 18000,
      method: "pix",
    });
  });

  it("leaves the amount empty for hourly and monthly pay", () => {
    for (const payType of ["hourly", "monthly"] as const)
      expect(
        dayPaymentDraft({ payType, rateCents: 2500 }, "2026-10-06", "2026-10-07").amountCents,
      ).toBeNull();
  });
});

describe("paymentFormData", () => {
  const base = {
    referenceMonth: "2026-10",
    paidOn: "2026-10-07",
    amountCents: 18000,
    method: "pix" as const,
  };

  it("leaves empty optional fields out", () => {
    const form = paymentFormData({ ...base, note: null, agreementId: null }, null);
    expect([...form.keys()].sort()).toEqual(["amountCents", "method", "paidOn", "referenceMonth"]);
  });

  it("sends note, agreement, extra flag and receipt when set", () => {
    const file = new File(["x"], "r.png", { type: "image/png" });
    const form = paymentFormData(
      { ...base, method: "compensation", note: "celular", agreementId: "a1", isExtra: true },
      file,
    );
    expect(form.get("note")).toBe("celular");
    expect(form.get("agreementId")).toBe("a1");
    expect(form.get("isExtra")).toBe("true");
    expect(form.get("receipt")).toBeInstanceOf(File);
  });
});

function row(id: string, contractId: string, extra: Partial<Payment> = {}): PaymentRow {
  return {
    contract: { id: contractId, startedOn: "2025-03-01" } as Contract,
    payment: {
      id,
      contractId,
      referenceMonth: "2026-09",
      paidOn: "2026-10-02",
      amountCents: 10000,
      method: "pix",
      note: null,
      receipt: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      acknowledgedByRole: null,
      isExtra: false,
      createdBy: "u",
      createdAt: "2026-10-02T00:00:00Z",
      agreementId: null,
      ...extra,
    },
  };
}

const rows = [
  row("a", "c1"),
  row("b", "c2", { method: "cash", acknowledgedAt: "2026-10-03T00:00:00Z", amountCents: 5000 }),
];

describe("matchesPaymentFilters", () => {
  it("keeps everything without filters", () => {
    expect(rows.filter((r) => matchesPaymentFilters(r, {}))).toHaveLength(2);
  });

  it("filters by person, method and acknowledgement", () => {
    expect(
      rows.filter((r) => matchesPaymentFilters(r, { pessoa: "c2" })).map((r) => r.payment.id),
    ).toEqual(["b"]);
    expect(
      rows.filter((r) => matchesPaymentFilters(r, { forma: "pix" })).map((r) => r.payment.id),
    ).toEqual(["a"]);
    expect(
      rows.filter((r) => matchesPaymentFilters(r, { recebido: "sim" })).map((r) => r.payment.id),
    ).toEqual(["b"]);
    expect(
      rows.filter((r) => matchesPaymentFilters(r, { recebido: "nao" })).map((r) => r.payment.id),
    ).toEqual(["a"]);
  });
});

describe("receivedStatus", () => {
  it("tells the worker's recebi from the employer closing the payment", () => {
    expect(receivedStatus({ acknowledgedAt: null, acknowledgedByRole: null }).label).toBe(
      "aguardando",
    );
    expect(receivedStatus({ acknowledgedAt: "x", acknowledgedByRole: "worker" }).label).toBe(
      "recebido",
    );
    expect(receivedStatus({ acknowledgedAt: "x", acknowledgedByRole: "employer" })).toEqual({
      label: "concluído",
      tone: "brand",
      done: true,
    });
  });
});

describe("paymentTotals", () => {
  it("sums amounts and counts acknowledgements", () => {
    expect(paymentTotals(rows)).toEqual({ count: 2, cents: 15000, acknowledged: 1 });
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
