import { describe, expect, it } from "vite-plus/test";
import {
  createAgreementSchema,
  createPaymentSchema,
  deleteAccountSchema,
  scheduleSchema,
} from "../src/index.ts";

const payment = { referenceMonth: "2026-10", paidOn: "2026-10-06", amountCents: 20000 };

describe("compensation payments", () => {
  it("must use compensation when tied to an agreement", () => {
    expect(
      createPaymentSchema.safeParse({ ...payment, method: "pix", agreementId: "a1" }).success,
    ).toBe(false);
    expect(
      createPaymentSchema.safeParse({ ...payment, method: "compensation", agreementId: "a1" })
        .success,
    ).toBe(true);
  });

  it("needs a note when not tied to an agreement", () => {
    expect(createPaymentSchema.safeParse({ ...payment, method: "compensation" }).success).toBe(
      false,
    );
    expect(
      createPaymentSchema.safeParse({ ...payment, method: "compensation", note: "mesa" }).success,
    ).toBe(true);
  });
});

describe("createAgreementSchema", () => {
  it("rejects an installment larger than the total", () => {
    const base = { description: "Mesa de jantar", totalCents: 120000, startMonth: "2026-10" };
    expect(createAgreementSchema.safeParse({ ...base, installmentCents: 200000 }).success).toBe(
      false,
    );
    expect(createAgreementSchema.parse({ ...base, installmentCents: 20000 }).installmentCents).toBe(
      20000,
    );
    expect(createAgreementSchema.parse(base).installmentCents).toBeNull();
  });
});

describe("deleteAccountSchema", () => {
  it("requires the confirmation word", () => {
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "excluir" }).success).toBe(
      false,
    );
    expect(deleteAccountSchema.safeParse({ password: "x", confirm: "EXCLUIR" }).success).toBe(true);
  });
});

describe("custom repetition", () => {
  it("accepts every N weeks up to 12", () => {
    expect(scheduleSchema.safeParse({ kind: "weekly", weekdays: [1], everyWeeks: 6 }).success).toBe(
      true,
    );
    expect(
      scheduleSchema.safeParse({ kind: "weekly", weekdays: [1], everyWeeks: 13 }).success,
    ).toBe(false);
  });
});
