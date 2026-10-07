import type { Adjustment, Payment } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import { extraRows, extraSigned } from "./extras.ts";

const advance: Adjustment = {
  id: "a1",
  contractId: "c1",
  month: "2026-09",
  kind: "advance",
  amountCents: 5000,
  description: "vale",
  createdBy: "u",
  createdAt: "2026-09-10T12:00:00Z",
};

function payment(id: string, extra: Partial<Payment>): Payment {
  return {
    id,
    contractId: "c1",
    referenceMonth: "2026-09",
    paidOn: "2026-09-20",
    amountCents: 10000,
    method: "pix",
    note: "festa",
    receipt: null,
    agreementId: null,
    isExtra: true,
    acknowledgedAt: null,
    acknowledgedBy: null,
    acknowledgedByRole: null,
    createdBy: "u",
    createdAt: "2026-09-20T12:00:00Z",
    ...extra,
  };
}

describe("extraRows", () => {
  it("lists adjustments and the month's extra payments, nothing else", () => {
    const rows = extraRows(
      [advance],
      [
        payment("p1", {}),
        payment("p2", { isExtra: false }),
        payment("p3", { referenceMonth: "2026-08" }),
      ],
      "2026-09",
    );
    expect(rows.map((r) => r.id)).toEqual(["a:a1", "p:p1"]);
    expect(rows.map(extraSigned)).toEqual([-5000, 10000]);
    expect(rows[1]!.description).toBe("festa");
  });
});
