import { describe, expect, it } from "vite-plus/test";
import {
  computeMonthSummary,
  createContractSchema,
  describeSchedule,
  expectedCountInMonth,
  expectedDatesInMonth,
  scheduleSchema,
  updateContractSchema,
  type Schedule,
  type SummaryInput,
} from "../src/index.ts";

const open = { startedOn: "2026-01-01", endedOn: null };
const weekly = (weekdays: number[], everyWeeks = 1): Schedule => ({
  kind: "weekly",
  weekdays,
  everyWeeks,
  monthDays: [],
  visitsPerMonth: null,
});

describe("expectedDatesInMonth", () => {
  it("twice a week", () => {
    // October 2026 starts on a Thursday.
    expect(expectedDatesInMonth(weekly([2, 4]), "2026-10", open)).toEqual([
      "2026-10-01",
      "2026-10-06",
      "2026-10-08",
      "2026-10-13",
      "2026-10-15",
      "2026-10-20",
      "2026-10-22",
      "2026-10-27",
      "2026-10-29",
    ]);
  });

  it("every day covers the whole month", () => {
    expect(expectedCountInMonth(weekly([0, 1, 2, 3, 4, 5, 6]), "2026-10", open)).toBe(31);
  });

  it("every other week is anchored on the start week", () => {
    // Started Friday 2026-10-02: expected 02, 16, 30.
    const period = { startedOn: "2026-10-02", endedOn: null };
    expect(expectedDatesInMonth(weekly([5], 2), "2026-10", period)).toEqual([
      "2026-10-02",
      "2026-10-16",
      "2026-10-30",
    ]);
    expect(expectedDatesInMonth(weekly([5], 2), "2026-11", period)).toEqual([
      "2026-11-13",
      "2026-11-27",
    ]);
  });

  it("fixed day of the month clamps to short months", () => {
    const s: Schedule = {
      kind: "month_days",
      weekdays: [],
      everyWeeks: 1,
      monthDays: [31],
      visitsPerMonth: null,
    };
    expect(expectedDatesInMonth(s, "2026-02", open)).toEqual(["2026-02-28"]);
    expect(expectedDatesInMonth(s, "2026-03", open)).toEqual(["2026-03-31"]);
  });

  it("per month has a count but no dates", () => {
    const s: Schedule = {
      kind: "per_month",
      weekdays: [],
      everyWeeks: 1,
      monthDays: [],
      visitsPerMonth: 1,
    };
    expect(expectedDatesInMonth(s, "2026-10", open)).toEqual([]);
    expect(expectedCountInMonth(s, "2026-10", open)).toBe(1);
    expect(expectedCountInMonth(s, "2025-12", open)).toBe(0);
  });

  it("on demand expects nothing", () => {
    const s: Schedule = {
      kind: "on_demand",
      weekdays: [],
      everyWeeks: 1,
      monthDays: [],
      visitsPerMonth: null,
    };
    expect(expectedCountInMonth(s, "2026-10", open)).toBe(0);
  });
});

describe("describeSchedule", () => {
  it("reads naturally in pt-BR", () => {
    expect(describeSchedule(weekly([1, 3, 5]))).toBe("seg, qua e sex");
    expect(describeSchedule(weekly([0, 1, 2, 3, 4, 5, 6]))).toBe("todos os dias");
    expect(describeSchedule(weekly([1, 2, 3, 4, 5, 6]))).toBe("seg a sáb");
    expect(describeSchedule(weekly([5], 2))).toBe("quinzenal: sex");
    expect(
      describeSchedule({
        kind: "month_days",
        weekdays: [],
        everyWeeks: 1,
        monthDays: [5],
        visitsPerMonth: null,
      }),
    ).toBe("todo dia 5");
    expect(
      describeSchedule({
        kind: "per_month",
        weekdays: [],
        everyWeeks: 1,
        monthDays: [],
        visitsPerMonth: 2,
      }),
    ).toBe("2x por mês");
  });
});

describe("scheduleSchema", () => {
  it("requires the field that matches the kind and drops the others", () => {
    expect(scheduleSchema.safeParse({ kind: "weekly", weekdays: [] }).success).toBe(false);
    expect(scheduleSchema.safeParse({ kind: "per_month" }).success).toBe(false);
    expect(scheduleSchema.parse({ kind: "per_month", visitsPerMonth: 2, weekdays: [1] })).toEqual({
      kind: "per_month",
      weekdays: [],
      everyWeeks: 1,
      monthDays: [],
      visitsPerMonth: 2,
    });
  });

  it("does not reset deductAbsences on partial updates", () => {
    expect(updateContractSchema.parse({ rateCents: 100 })).not.toHaveProperty("deductAbsences");
    const created = createContractSchema.parse({
      workerName: "Rosa",
      occupation: "diarista",
      payType: "daily",
      rateCents: 100,
      schedule: { kind: "on_demand" },
      expectedStart: null,
      expectedEnd: null,
      startedOn: "2026-10-01",
    });
    expect(created.deductAbsences).toBe(false);
  });
});

describe("monthly pay with absences", () => {
  const input: SummaryInput = {
    contract: {
      payType: "monthly",
      rateCents: 300000,
      schedule: weekly([1, 2, 3, 4, 5, 6]),
      deductAbsences: true,
      startedOn: "2026-01-01",
      endedOn: null,
      workerId: "w1",
    },
    month: "2026-09",
    entries: [
      { date: "2026-09-01", status: "absent", minutes: 0, confirmedAt: "x" },
      { date: "2026-09-02", status: "excused", minutes: 0, confirmedAt: "x" },
      { date: "2026-09-03", status: "worked", minutes: 480, confirmedAt: "x" },
    ],
    adjustments: [],
    payments: [],
    today: "2026-09-30",
  };

  it("deducts rate/30 per unjustified absence only", () => {
    const s = computeMonthSummary(input);
    expect(s.grossCents).toBe(300000);
    expect(s.absenceDeductionCents).toBe(10000);
    expect(s.dueCents).toBe(290000);
  });

  it("keeps full pay when deduction is off", () => {
    const s = computeMonthSummary({
      ...input,
      contract: { ...input.contract, deductAbsences: false },
    });
    expect(s.absenceDeductionCents).toBe(0);
    expect(s.dueCents).toBe(300000);
  });
});
