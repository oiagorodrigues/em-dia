import { describe, expect, it } from "vite-plus/test";
import { computeMonthSummary, type SummaryInput } from "../src/index.ts";

const base: SummaryInput = {
  contract: {
    payType: "hourly",
    rateCents: 3000,
    schedule: {
      kind: "weekly",
      weekdays: [1, 3, 5],
      everyWeeks: 1,
      monthDays: [],
      visitsPerMonth: null,
    },
    deductAbsences: false,
    startedOn: "2026-01-01",
    endedOn: null,
    workerId: "w1",
  },
  month: "2026-09",
  entries: [],
  payments: [],
  today: "2026-09-30",
};

describe("computeMonthSummary", () => {
  it("pays hourly by worked minutes", () => {
    const s = computeMonthSummary({
      ...base,
      entries: [
        { date: "2026-09-01", status: "worked", minutes: 480, confirmedAt: "x" },
        { date: "2026-09-02", status: "worked", minutes: 90, confirmedAt: null },
      ],
    });
    expect(s.totalMinutes).toBe(570);
    expect(s.grossCents).toBe(28500);
    expect(s.daysWorked).toBe(2);
    expect(s.pendingConfirmation).toBe(1);
    expect(s.avgPerDayCents).toBe(14250);
    expect(s.effectiveHourlyCents).toBe(3000);
  });

  it("pays daily by days worked and applies descontos and payments", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "daily", rateCents: 18000 },
      entries: [
        { date: "2026-09-07", status: "worked", minutes: 0, confirmedAt: "x" },
        { date: "2026-09-09", status: "absent", minutes: 0, confirmedAt: "x" },
        { date: "2026-09-11", status: "worked", minutes: 0, confirmedAt: "x" },
      ],
      payments: [
        { kind: "pay", method: "pix", amountCents: 20000 },
        { kind: "deduction", method: null, amountCents: 5000 },
      ],
    });
    expect(s.grossCents).toBe(36000);
    expect(s.adjustmentsCents).toBe(-5000);
    expect(s.dueCents).toBe(31000);
    expect(s.paidCents).toBe(20000);
    expect(s.balanceCents).toBe(11000);
    expect(s.absences).toBe(1);
  });

  it("monthly pay is fixed", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "monthly", rateCents: 250000 },
    });
    expect(s.grossCents).toBe(250000);
  });

  it("counts gratificação and vale-transporte as due and as paid, leaving the balance alone", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "monthly", rateCents: 150000 },
      payments: [
        { kind: "pay", method: "pix", amountCents: 150000 },
        { kind: "bonus", method: "cash", amountCents: 10000 },
        { kind: "transport", method: "pix", amountCents: 4400 },
      ],
    });
    expect(s.adjustmentsCents).toBe(14400);
    expect(s.dueCents).toBe(164400);
    expect(s.paidCents).toBe(164400);
    expect(s.balanceCents).toBe(0);
  });

  it("lowers only what is due with a desconto", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "monthly", rateCents: 150000 },
      payments: [{ kind: "deduction", method: null, amountCents: 3000 }],
    });
    expect(s.dueCents).toBe(147000);
    expect(s.paidCents).toBe(0);
    expect(s.balanceCents).toBe(147000);
  });

  it("counts a migrated gratificação without method as due only", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "monthly", rateCents: 150000 },
      payments: [
        { kind: "pay", method: "pix", amountCents: 160000 },
        { kind: "bonus", method: null, amountCents: 10000 },
      ],
    });
    expect(s.dueCents).toBe(160000);
    expect(s.paidCents).toBe(160000);
    expect(s.balanceCents).toBe(0);
  });

  it("leaves the month alone when an adiantamento is handed, and pays the days it abates", () => {
    const contract = { ...base.contract, payType: "daily" as const, rateCents: 18000 };
    const entries = [
      { date: "2026-09-07", status: "worked" as const, minutes: 0, confirmedAt: "x" },
      { date: "2026-09-08", status: "worked" as const, minutes: 0, confirmedAt: "x" },
    ];
    const handed = computeMonthSummary({
      ...base,
      contract,
      entries,
      payments: [{ kind: "advance", method: "pix", amountCents: 36000 }],
    });
    expect(handed.dueCents).toBe(36000);
    expect(handed.paidCents).toBe(0);
    expect(handed.balanceCents).toBe(36000);

    const abated = computeMonthSummary({
      ...base,
      contract,
      entries,
      payments: [
        { kind: "advance", method: "pix", amountCents: 36000 },
        { kind: "pay", method: "compensation", amountCents: 18000 },
      ],
    });
    expect(abated.dueCents).toBe(36000);
    expect(abated.paidCents).toBe(18000);
    expect(abated.balanceCents).toBe(18000);
  });

  it("counts expected and unrecorded scheduled days up to today", () => {
    const s = computeMonthSummary({
      ...base,
      today: "2026-09-09",
      entries: [{ date: "2026-09-02", status: "worked", minutes: 60, confirmedAt: "x" }],
    });
    expect(s.expectedDays).toBe(13);
    expect(s.unrecordedDates).toEqual(["2026-09-04", "2026-09-07", "2026-09-09"]);
  });

  it("ignores scheduled days outside the contract period", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, startedOn: "2026-09-15", endedOn: "2026-09-20" },
    });
    expect(s.expectedDays).toBe(2);
  });

  it("does not count pending confirmations when no worker is linked", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, workerId: null },
      entries: [{ date: "2026-09-01", status: "worked", minutes: 60, confirmedAt: null }],
    });
    expect(s.pendingConfirmation).toBe(0);
  });
});
