import type { Agreement } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import {
  agreementProgress,
  agreementStatus,
  isOpenAgreement,
  nextInstallmentCents,
} from "./agreement.ts";

function agreement(patch: Partial<Agreement> = {}): Agreement {
  return {
    id: "a1",
    contractId: "c1",
    description: "Mesa de jantar",
    totalCents: 120000,
    installmentCents: 20000,
    startMonth: "2026-09",
    settledCents: 20000,
    remainingCents: 100000,
    acceptedAt: "2026-09-02T12:00:00Z",
    cancelledAt: null,
    archivedAt: null,
    createdBy: "u1",
    createdAt: "2026-09-01T12:00:00Z",
    ...patch,
  };
}

describe("agreementStatus", () => {
  it("covers the five states", () => {
    expect(agreementStatus(agreement({ acceptedAt: null })).state).toBe("pending");
    expect(agreementStatus(agreement()).state).toBe("running");
    expect(agreementStatus(agreement({ remainingCents: 0, acceptedAt: null })).state).toBe(
      "settled",
    );
    expect(agreementStatus(agreement({ cancelledAt: "2026-10-01T00:00:00Z" }))).toMatchObject({
      state: "cancelled",
      tone: "neutral",
    });
    expect(
      agreementStatus(
        agreement({ archivedAt: "2026-10-02T00:00:00Z", cancelledAt: "2026-10-01T00:00:00Z" }),
      ),
    ).toMatchObject({ state: "removed", label: "removido" });
  });
});

describe("agreement amounts", () => {
  it("computes progress and the next installment", () => {
    expect(agreementProgress(agreement())).toBe(17);
    expect(nextInstallmentCents(agreement())).toBe(20000);
    expect(nextInstallmentCents(agreement({ remainingCents: 5000 }))).toBe(5000);
    expect(nextInstallmentCents(agreement({ installmentCents: null }))).toBe(100000);
  });

  it("knows which agreements still take payments", () => {
    expect(isOpenAgreement(agreement())).toBe(true);
    expect(isOpenAgreement(agreement({ remainingCents: 0 }))).toBe(false);
    expect(isOpenAgreement(agreement({ cancelledAt: "x" }))).toBe(false);
    expect(isOpenAgreement(agreement({ archivedAt: "x" }))).toBe(false);
  });
});
