import type { Contract, Payment } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import { matchesPaymentFilters, paymentTotals, paymentYears, type PaymentRow } from "./payments.ts";

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
      createdBy: "u",
      createdAt: "2026-10-02T00:00:00Z",
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
