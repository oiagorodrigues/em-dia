import { describe, expect, it } from "vite-plus/test";
import {
  createContractSchema,
  estimateAverageMonthlyCost,
  estimateMonthCost,
  updateContractSchema,
  type EstimateInput,
  type Schedule,
} from "../src/index.ts";

const weekly = (weekdays: number[], everyWeeks = 1): Schedule => ({
  kind: "weekly",
  weekdays,
  everyWeeks,
  monthDays: [],
  visitsPerMonth: null,
});

const base: EstimateInput = {
  payType: "daily",
  rateCents: 18000,
  schedule: weekly([2, 5]),
  expectedStart: "08:00",
  expectedEnd: "16:00",
  startedOn: "2026-10-01",
};

describe("estimateMonthCost", () => {
  it("daily: rate × expected days", () => {
    // October 2026 has 4 Tuesdays and 5 Fridays.
    expect(estimateMonthCost(base, "2026-10")).toEqual({
      month: "2026-10",
      days: 9,
      minutesPerDay: 480,
      cents: 162000,
    });
  });

  it("only counts from the start date", () => {
    expect(estimateMonthCost({ ...base, startedOn: "2026-10-20" }, "2026-10").days).toBe(4);
  });

  it("quinzenal counts from the first scheduled day after the start", () => {
    // Started Saturday 2026-09-26: Fridays 10-02, 10-16 and 10-30.
    const quinzenal = { ...base, schedule: weekly([5], 2), startedOn: "2026-09-26" };
    expect(estimateMonthCost(quinzenal, "2026-09").cents).toBe(0);
    expect(estimateMonthCost(quinzenal, "2026-10")).toMatchObject({ days: 3, cents: 3 * 18000 });
  });

  it("hourly: rate × hours per day × days, unknown without times", () => {
    const hourly = { ...base, payType: "hourly" as const, rateCents: 2500 };
    expect(estimateMonthCost(hourly, "2026-10").cents).toBe(9 * 8 * 2500);
    expect(estimateMonthCost({ ...hourly, expectedEnd: null }, "2026-10").cents).toBeNull();
  });

  it("monthly: fixed while the contract is active", () => {
    const monthly = { ...base, payType: "monthly" as const, rateCents: 300000 };
    expect(estimateMonthCost(monthly, "2026-10").cents).toBe(300000);
    expect(estimateMonthCost(monthly, "2026-09").cents).toBe(0);
  });

  it("per_month uses the visit count; on_demand can't be estimated for daily pay", () => {
    const perMonth: Schedule = {
      kind: "per_month",
      weekdays: [],
      everyWeeks: 1,
      monthDays: [],
      visitsPerMonth: 2,
    };
    expect(estimateMonthCost({ ...base, schedule: perMonth }, "2026-10").cents).toBe(36000);
    const onDemand: Schedule = { ...perMonth, kind: "on_demand", visitsPerMonth: null };
    expect(estimateMonthCost({ ...base, schedule: onDemand }, "2026-10").cents).toBeNull();
  });
});

describe("estimateAverageMonthlyCost", () => {
  it("averages a quinzenal schedule over a year", () => {
    const avg = estimateAverageMonthlyCost(
      { ...base, schedule: weekly([5], 2), startedOn: "2026-10-02" },
      "2026-10",
    );
    // 26 fortnightly Fridays in 52 weeks ≈ 2.17 per month.
    expect(avg).toBeGreaterThan(2 * 18000);
    expect(avg).toBeLessThan(3 * 18000);
  });
});

describe("contact fields", () => {
  const contract = {
    workerName: "Rosa",
    occupation: "diarista",
    payType: "daily",
    rateCents: 100,
    schedule: { kind: "on_demand" },
    expectedStart: null,
    expectedEnd: null,
    startedOn: "2026-10-01",
  };

  it("are optional and blank means none", () => {
    const parsed = createContractSchema.parse({ ...contract, contactEmail: "", contactPhone: "" });
    expect(parsed.contactEmail).toBeNull();
    expect(parsed.contactPhone).toBeNull();
  });

  it("validate when present", () => {
    expect(createContractSchema.safeParse({ ...contract, contactEmail: "x" }).success).toBe(false);
    expect(createContractSchema.safeParse({ ...contract, contactPhone: "1234" }).success).toBe(
      false,
    );
    expect(
      createContractSchema.parse({ ...contract, contactPhone: "(11) 98765-4321" }).contactPhone,
    ).toBe("(11) 98765-4321");
  });

  it("are left alone by a partial update that omits them", () => {
    const parsed = updateContractSchema.parse({ rateCents: 200 });
    expect(parsed.contactEmail).toBeUndefined();
    expect(parsed.contactPhone).toBeUndefined();
  });
});
