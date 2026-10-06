import { EMPTY_SCHEDULE, type Schedule } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import { describeEstimate, describeHours } from "./estimate.ts";

const weekly = (weekdays: number[], everyWeeks = 1): Schedule => ({
  ...EMPTY_SCHEDULE,
  kind: "weekly",
  weekdays,
  everyWeeks,
});

/** Intl puts a no-break space after "R$". */
const n = (s: string | null) => s?.replace(/\s/g, " ") ?? null;

const base = {
  expectedStart: "08:00",
  expectedEnd: "16:00",
  startedOn: "2026-10-01",
};

describe("describeEstimate", () => {
  it("prices daily pay as diárias × rate", () => {
    const e = describeEstimate(
      { ...base, payType: "daily", rateCents: 18000, schedule: weekly([1, 3, 5]) },
      "2026-10",
    );
    // October 2026: 4 Mondays, 4 Wednesdays, 5 Fridays.
    expect(n(e.total)).toBe("R$ 2.340,00");
    expect(e.when).toBe("em outubro");
    expect(n(e.breakdown)).toBe("13 diárias × R$ 180,00");
    // 156 visits a year is exactly 13 a month: no separate average line.
    expect(e.average).toBeNull();
    expect(e.reason).toBeNull();
  });

  it("adds the 12-month average when months differ (quinzenal)", () => {
    const e = describeEstimate(
      { ...base, payType: "daily", rateCents: 18000, schedule: weekly([5], 2) },
      "2026-10",
    );
    expect(n(e.breakdown)).toBe("3 diárias × R$ 180,00");
    expect(n(e.average)).toMatch(/^média de R\$ [\d.]+,\d\d por mês$/);
  });

  it("prices hourly pay as days × hours × rate", () => {
    const e = describeEstimate(
      { ...base, payType: "hourly", rateCents: 2500, schedule: weekly([1, 2, 3, 4, 5]) },
      "2026-10",
    );
    expect(n(e.breakdown)).toBe("22 dias × 8h × R$ 25,00");
    expect(n(e.total)).toBe("R$ 4.400,00");
  });

  it("shows the salary for monthly pay without an average line", () => {
    const e = describeEstimate(
      { ...base, payType: "monthly", rateCents: 300000, schedule: weekly([1, 2, 3, 4, 5]) },
      "2026-10",
    );
    expect(n(e.total)).toBe("R$ 3.000,00");
    expect(n(e.breakdown)).toBe("salário fixo do mês");
    expect(n(e.average)).toBeNull();
  });

  it("explains why it can't be priced", () => {
    expect(
      describeEstimate(
        {
          ...base,
          expectedStart: null,
          payType: "hourly",
          rateCents: 2500,
          schedule: weekly([1]),
        },
        "2026-10",
      ).reason,
    ).toBe("informe os horários para estimar");
    expect(
      describeEstimate(
        { ...base, payType: "daily", rateCents: 18000, schedule: EMPTY_SCHEDULE },
        "2026-10",
      ).reason,
    ).toMatch(/^quando precisar não tem custo fixo/);
    expect(
      describeEstimate(
        { ...base, payType: "daily", rateCents: null, schedule: weekly([1]) },
        "2026-10",
      ).reason,
    ).toBe("informe o valor para estimar");
    expect(
      describeEstimate(
        { ...base, payType: "daily", rateCents: 100, schedule: weekly([]) },
        "2026-10",
      ).reason,
    ).toBe("escolha os dias para estimar");
  });
});

describe("describeHours", () => {
  it("describes the expected shift", () => {
    expect(describeHours("08:00", "17:30")).toBe("das 08:00 às 17:30 · 9h30 por dia");
    expect(describeHours("08:00", null)).toBeNull();
  });
});
