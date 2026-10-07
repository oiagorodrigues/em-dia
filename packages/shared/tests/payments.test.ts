import { describe, expect, it } from "vite-plus/test";
import { can, createPaymentSchema, paymentRuleIssues, updatePaymentSchema } from "../src/index.ts";

const valid = {
  referenceMonth: "2026-09",
  paidOn: "2026-10-05",
  amountCents: "54000",
  method: "pix",
};

describe("createPaymentSchema", () => {
  it("reads the multipart isExtra flag as a boolean", () => {
    expect(createPaymentSchema.parse({ ...valid, isExtra: "true" }).isExtra).toBe(true);
    expect(createPaymentSchema.parse({ ...valid, isExtra: "false" }).isExtra).toBe(false);
    expect(createPaymentSchema.parse(valid).isExtra).toBeUndefined();
  });

  it("does not let a compensation count as an extra", () => {
    const res = createPaymentSchema.safeParse({
      ...valid,
      method: "compensation",
      note: "mesa",
      isExtra: true,
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(["isExtra"]);
  });
});

describe("updatePaymentSchema", () => {
  it("accepts any subset of fields but not an empty edit", () => {
    expect(updatePaymentSchema.safeParse({ amountCents: 1000 }).success).toBe(true);
    expect(updatePaymentSchema.safeParse({ isExtra: true }).success).toBe(true);
    expect(updatePaymentSchema.safeParse({}).success).toBe(false);
  });
});

describe("paymentRuleIssues", () => {
  it("checks the merged payment the same way create does", () => {
    expect(paymentRuleIssues({ method: "pix", agreementId: "a1" })).toEqual([
      { path: "method", message: "Acordos são abatidos como compensação" },
    ]);
    expect(paymentRuleIssues({ method: "compensation", note: null })).toHaveLength(1);
    expect(paymentRuleIssues({ method: "compensation", agreementId: "a1" })).toEqual([]);
  });
});

describe("payment permissions", () => {
  it("lets the employer confirm and the worker acknowledge, not the other way round", () => {
    expect(can("employer", "payment:confirm")).toBe(true);
    expect(can("worker", "payment:confirm")).toBe(false);
    expect(can("employer", "payment:acknowledge")).toBe(false);
    expect(can("worker", "payment:acknowledge")).toBe(true);
  });
});
