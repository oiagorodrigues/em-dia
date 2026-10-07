import { describe, expect, it } from "vite-plus/test";
import {
  can,
  countsAsPaid,
  createPaymentSchema,
  handsMoney,
  isOpenAdvance,
  paymentRuleIssues,
  updatePaymentSchema,
} from "../src/index.ts";

const valid = {
  referenceMonth: "2026-09",
  paidOn: "2026-10-05",
  amountCents: "54000",
  method: "pix",
};

describe("createPaymentSchema", () => {
  it("defaults to a diárias/salário payment", () => {
    expect(createPaymentSchema.parse(valid).kind).toBe("pay");
    expect(createPaymentSchema.parse({ ...valid, kind: "bonus" }).kind).toBe("bonus");
  });

  it("asks how money was paid for every kind but desconto", () => {
    for (const kind of ["pay", "bonus", "transport", "advance"]) {
      const res = createPaymentSchema.safeParse({ ...valid, kind, method: "" });
      expect(res.error?.issues[0]?.path).toEqual(["method"]);
    }
  });

  it("takes a desconto without a method and rejects one with it", () => {
    const { method: _m, ...noMethod } = valid;
    expect(createPaymentSchema.parse({ ...noMethod, kind: "deduction" }).method).toBeUndefined();
    expect(
      createPaymentSchema.parse({ ...valid, kind: "deduction", method: "" }).method,
    ).toBeNull();
    const res = createPaymentSchema.safeParse({ ...valid, kind: "deduction" });
    expect(res.error?.issues[0]?.path).toEqual(["method"]);
  });

  it("does not let a compensation be anything but diárias/salário", () => {
    const res = createPaymentSchema.safeParse({
      ...valid,
      kind: "bonus",
      method: "compensation",
      note: "mesa",
    });
    expect(res.error?.issues[0]?.path).toEqual(["kind"]);
  });

  it("abates an adiantamento only as compensation", () => {
    expect(createPaymentSchema.safeParse({ ...valid, advanceId: "p1" }).success).toBe(false);
    expect(
      createPaymentSchema.safeParse({ ...valid, method: "compensation", advanceId: "p1" }).success,
    ).toBe(true);
  });
});

describe("updatePaymentSchema", () => {
  it("accepts any subset of fields but not an empty edit", () => {
    expect(updatePaymentSchema.safeParse({ amountCents: 1000 }).success).toBe(true);
    expect(updatePaymentSchema.safeParse({ kind: "transport" }).success).toBe(true);
    expect(updatePaymentSchema.safeParse({}).success).toBe(false);
  });
});

describe("paymentRuleIssues", () => {
  it("checks the merged payment the same way create does", () => {
    expect(paymentRuleIssues({ kind: "pay", method: "pix", agreementId: "a1" })).toEqual([
      { path: "method", message: "Acordos são abatidos como compensação" },
    ]);
    expect(paymentRuleIssues({ kind: "pay", method: "compensation", note: null })).toHaveLength(1);
    expect(paymentRuleIssues({ kind: "pay", method: "compensation", agreementId: "a1" })).toEqual(
      [],
    );
  });

  it("never links a desconto to an agreement or an adiantamento", () => {
    expect(paymentRuleIssues({ kind: "deduction", method: null, advanceId: "p1" })).toEqual([
      { path: "kind", message: "Desconto não abate acordo nem adiantamento" },
    ]);
  });

  it("does not take an agreement and an adiantamento at once", () => {
    const issues = paymentRuleIssues({
      kind: "pay",
      method: "compensation",
      agreementId: "a1",
      advanceId: "p1",
    });
    expect(issues.map((i) => i.path)).toEqual(["advanceId"]);
  });

  it("lets a migrated gratificação keep its missing method", () => {
    expect(paymentRuleIssues({ kind: "bonus", method: null })).toHaveLength(1);
    expect(paymentRuleIssues({ kind: "bonus", method: null }, { methodOptional: true })).toEqual(
      [],
    );
  });
});

describe("payment kinds", () => {
  it("counts handed money as paid, except an adiantamento", () => {
    expect(countsAsPaid({ kind: "pay", method: "pix" })).toBe(true);
    expect(countsAsPaid({ kind: "bonus", method: "cash" })).toBe(true);
    expect(countsAsPaid({ kind: "advance", method: "pix" })).toBe(false);
    expect(countsAsPaid({ kind: "deduction", method: null })).toBe(false);
    expect(countsAsPaid({ kind: "bonus", method: null })).toBe(false);
  });

  it("lets the worker confirm only entries where money changed hands", () => {
    expect(handsMoney({ kind: "advance", method: "pix" })).toBe(true);
    expect(handsMoney({ kind: "deduction", method: null })).toBe(false);
  });

  it("calls an adiantamento open while something is left to abate", () => {
    expect(isOpenAdvance({ kind: "advance", remainingCents: 18000 })).toBe(true);
    expect(isOpenAdvance({ kind: "advance", remainingCents: 0 })).toBe(false);
    expect(isOpenAdvance({ kind: "pay", remainingCents: null })).toBe(false);
  });
});

describe("payment permissions", () => {
  it("lets the employer confirm and the worker acknowledge, not the other way round", () => {
    expect(can("employer", "payment:confirm")).toBe(true);
    expect(can("worker", "payment:confirm")).toBe(false);
    expect(can("employer", "payment:acknowledge")).toBe(false);
    expect(can("worker", "payment:acknowledge")).toBe(true);
  });

  it("keeps every kind, abatements included, an employer write", () => {
    expect(can("employer", "payment:write")).toBe(true);
    expect(can("worker", "payment:write")).toBe(false);
  });
});
