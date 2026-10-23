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
    expectedStart: null,
    expectedEnd: null,
    nightBonus: false,
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
        {
          date: "2026-09-01",
          status: "worked",
          minutes: 480,
          breakMinutes: 0,
          checkIn: null,
          checkOut: null,
          checkOutDate: null,
          confirmedAt: "x",
        },
        {
          date: "2026-09-02",
          status: "worked",
          minutes: 90,
          breakMinutes: 0,
          checkIn: null,
          checkOut: null,
          checkOutDate: null,
          confirmedAt: null,
        },
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
        {
          date: "2026-09-07",
          status: "worked",
          minutes: 0,
          breakMinutes: 0,
          checkIn: null,
          checkOut: null,
          checkOutDate: null,
          confirmedAt: "x",
        },
        {
          date: "2026-09-09",
          status: "absent",
          minutes: 0,
          breakMinutes: 0,
          checkIn: null,
          checkOut: null,
          checkOutDate: null,
          confirmedAt: "x",
        },
        {
          date: "2026-09-11",
          status: "worked",
          minutes: 0,
          breakMinutes: 0,
          checkIn: null,
          checkOut: null,
          checkOutDate: null,
          confirmedAt: "x",
        },
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

  it("pays a diária in proportion when the day runs longer or shorter than the agreed times", () => {
    const day = (date: string, minutes: number, breakMinutes = 60) => ({
      date,
      status: "worked" as const,
      minutes,
      breakMinutes,
      checkIn: null,
      checkOut: null,
      checkOutDate: null,
      confirmedAt: "x",
    });
    const s = computeMonthSummary({
      ...base,
      contract: {
        ...base.contract,
        payType: "daily",
        rateCents: 15000,
        expectedStart: "08:00",
        expectedEnd: "17:00",
      },
      // 8h agreed (9h less the break): one diária, one and a half, a half, and a shorter break.
      entries: [
        day("2026-09-01", 480),
        day("2026-09-02", 720),
        day("2026-09-03", 240),
        day("2026-09-04", 510, 30),
      ],
    });
    expect(s.grossCents).toBe(15000 + 22500 + 7500 + 15000);
    expect(s.daysWorked).toBe(4);
  });

  it("keeps a whole diária without agreed times or before the check-out", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "daily", rateCents: 15000 },
      entries: [
        {
          date: "2026-09-01",
          status: "worked",
          minutes: 720,
          breakMinutes: 0,
          checkIn: null,
          checkOut: null,
          checkOutDate: null,
          confirmedAt: "x",
        },
      ],
    });
    expect(s.grossCents).toBe(15000);
  });

  it("monthly pay is fixed", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "monthly", rateCents: 250000 },
    });
    expect(s.grossCents).toBe(250000);
  });

  it("quinzenal pay is two quinzenas a month, with absences off a thirtieth of the month", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "biweekly", rateCents: 75000, deductAbsences: true },
    });
    expect(s.grossCents).toBe(150000);
    expect(s.absenceDeductionCents).toBe(s.absences * 5000);
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
      {
        date: "2026-09-07",
        status: "worked" as const,
        minutes: 0,
        breakMinutes: 0,
        checkIn: null,
        checkOut: null,
        checkOutDate: null,
        confirmedAt: "x",
      },
      {
        date: "2026-09-08",
        status: "worked" as const,
        minutes: 0,
        breakMinutes: 0,
        checkIn: null,
        checkOut: null,
        checkOutDate: null,
        confirmedAt: "x",
      },
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

  it("settles a diária paid with an abatement, a desconto and money", () => {
    const entry = {
      date: "2026-09-07",
      status: "worked" as const,
      minutes: 0,
      breakMinutes: 0,
      checkIn: null,
      checkOut: null,
      checkOutDate: null,
      confirmedAt: "x",
    };
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "daily", rateCents: 18000 },
      entries: [entry],
      payments: [
        { kind: "advance", method: "pix", amountCents: 36000 },
        { kind: "pay", method: "compensation", amountCents: 5000 },
        { kind: "deduction", method: null, amountCents: 1000 },
        { kind: "pay", method: "pix", amountCents: 12000 },
      ],
    });
    expect(s.dueCents).toBe(18000 - 1000);
    expect(s.paidCents).toBe(17000);
    expect(s.balanceCents).toBe(0);
  });

  it("leaves a salary to be closed with the abatement and the desconto already taken off", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "monthly", rateCents: 250000 },
      payments: [
        { kind: "advance", method: "pix", amountCents: 50000 },
        { kind: "pay", method: "compensation", amountCents: 50000 },
        { kind: "deduction", method: null, amountCents: 10000 },
      ],
    });
    expect(s.dueCents).toBe(240000);
    expect(s.paidCents).toBe(50000);
    expect(s.balanceCents).toBe(190000);

    const closed = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "monthly", rateCents: 250000 },
      payments: [
        { kind: "advance", method: "pix", amountCents: 50000 },
        { kind: "pay", method: "compensation", amountCents: 50000 },
        { kind: "deduction", method: null, amountCents: 10000 },
        { kind: "pay", method: "pix", amountCents: 190000 },
      ],
    });
    expect(closed.balanceCents).toBe(0);
  });

  it("counts expected and unrecorded scheduled days up to today", () => {
    const s = computeMonthSummary({
      ...base,
      today: "2026-09-09",
      entries: [
        {
          date: "2026-09-02",
          status: "worked",
          minutes: 60,
          breakMinutes: 0,
          checkIn: null,
          checkOut: null,
          checkOutDate: null,
          confirmedAt: "x",
        },
      ],
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
      entries: [
        {
          date: "2026-09-01",
          status: "worked",
          minutes: 60,
          breakMinutes: 0,
          checkIn: null,
          checkOut: null,
          checkOutDate: null,
          confirmedAt: null,
        },
      ],
    });
    expect(s.pendingConfirmation).toBe(0);
  });
});

describe("plantão and adicional noturno", () => {
  const worked = (
    date: string,
    checkIn: string,
    checkOut: string,
    checkOutDate: string | null,
    minutes: number,
  ) => ({
    date,
    status: "worked" as const,
    minutes,
    breakMinutes: 0,
    checkIn,
    checkOut,
    checkOutDate,
    confirmedAt: "x",
  });
  const shift = { ...base.contract, payType: "shift" as const, rateCents: 30000 };

  it("pays a plantão per 24 hours, in proportion to the stay", () => {
    const s = computeMonthSummary({
      ...base,
      contract: shift,
      // Friday 08:00 to Monday 08:00: three plantões.
      entries: [worked("2026-09-04", "08:00", "08:00", "2026-09-07", 72 * 60)],
    });
    expect(s.grossCents).toBe(90000);
    expect(s.nightBonusCents).toBe(0);
    expect(s.dueCents).toBe(90000);
  });

  it("adds 20% on the night hours when the contract has it on", () => {
    const s = computeMonthSummary({
      ...base,
      contract: { ...shift, nightBonus: true },
      entries: [worked("2026-09-04", "08:00", "08:00", "2026-09-07", 72 * 60)],
    });
    // 21 night hours at R$ 300 / 24h = R$ 12,50 an hour, plus 20%: R$ 52,50.
    expect(s.nightMinutes).toBe(21 * 60);
    expect(s.nightBonusCents).toBe(5250);
    expect(s.dueCents).toBe(90000 + 5250);
  });

  it("prices the night of an hourly or salaried contract from its own hour", () => {
    const night = worked("2026-09-02", "22:00", "06:00", null, 8 * 60);
    const hourly = computeMonthSummary({
      ...base,
      contract: { ...base.contract, nightBonus: true },
      entries: [night],
    });
    // 7 night hours × R$ 30 × 20%.
    expect(hourly.nightBonusCents).toBe(4200);
    const monthly = computeMonthSummary({
      ...base,
      contract: { ...base.contract, payType: "monthly", rateCents: 220000, nightBonus: true },
      entries: [night],
    });
    // R$ 2.200 / 220h = R$ 10 an hour; 7h × R$ 10 × 20%.
    expect(monthly.nightBonusCents).toBe(1400);
    expect(monthly.dueCents).toBe(220000 + 1400);
  });
});
