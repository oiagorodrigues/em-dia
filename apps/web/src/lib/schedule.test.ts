import type { Schedule } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import {
  attendanceLabel,
  attendanceText,
  DEFAULT_SCHEDULE,
  sameDays,
  scheduleSummaryLine,
  toggleDay,
  WEEKDAY_PRESETS,
  withKind,
} from "./schedule.ts";

const weekly = (weekdays: number[], everyWeeks = 1): Schedule => ({
  ...DEFAULT_SCHEDULE,
  weekdays,
  everyWeeks,
});

describe("schedule form logic", () => {
  it("toggles days keeping them sorted", () => {
    expect(toggleDay([1, 5], 3)).toEqual([1, 3, 5]);
    expect(toggleDay([1, 3, 5], 3)).toEqual([1, 5]);
  });

  it("recognises presets regardless of order", () => {
    expect(sameDays([5, 4, 3, 2, 1], WEEKDAY_PRESETS[0].weekdays)).toBe(true);
    expect(sameDays([1, 2, 3, 4], WEEKDAY_PRESETS[0].weekdays)).toBe(false);
  });

  it("seeds sensible values when switching kind and keeps earlier choices", () => {
    const monthDays = withKind(weekly([2, 4]), "month_days");
    expect(monthDays).toMatchObject({ kind: "month_days", monthDays: [5], weekdays: [2, 4] });
    expect(withKind(monthDays, "weekly").weekdays).toEqual([2, 4]);
    expect(withKind(DEFAULT_SCHEDULE, "per_month").visitsPerMonth).toBe(2);
    expect(
      withKind({ ...DEFAULT_SCHEDULE, kind: "on_demand", weekdays: [] }, "weekly").weekdays,
    ).toEqual([1, 3, 5]);
  });

  it("summarises the schedule with the expected count for the month", () => {
    expect(scheduleSummaryLine(weekly([1, 3, 5]), "2026-10", "2026-01-01")).toBe(
      "seg, qua e sex · 13 dias em outubro",
    );
    expect(scheduleSummaryLine(weekly([5], 2), "2026-10", "2026-10-02")).toBe(
      "quinzenal: sex · ~3 dias em outubro",
    );
    expect(
      scheduleSummaryLine(
        { ...DEFAULT_SCHEDULE, kind: "month_days", monthDays: [5] },
        "2026-10",
        "2026-01-01",
      ),
    ).toBe("todo dia 5 · 1 dia em outubro");
    expect(
      scheduleSummaryLine(
        { ...DEFAULT_SCHEDULE, kind: "per_month", visitsPerMonth: 2 },
        "2026-10",
        "2026-01-01",
      ),
    ).toBe("2x por mês · 2 visitas em outubro");
    expect(
      scheduleSummaryLine({ ...DEFAULT_SCHEDULE, kind: "on_demand" }, "2026-10", "2026-01-01"),
    ).toBe("quando precisar · sem dias previstos");
  });

  it("counts only the days from the start date on", () => {
    // Started Tue 06/10: Mon/Wed/Fri from the 7th are 7, 9, 12 … 30.
    expect(scheduleSummaryLine(weekly([1, 3, 5]), "2026-10", "2026-10-06")).toBe(
      "seg, qua e sex · 11 dias em outubro",
    );
    expect(scheduleSummaryLine(weekly([1, 2, 3, 4, 5]), "2026-10", "2026-10-20")).toBe(
      "seg a sex · 9 dias em outubro",
    );
  });

  it("previews the start month when the contract starts in the future", () => {
    expect(scheduleSummaryLine(weekly([5], 2), "2026-11", "2026-11-06")).toBe(
      "quinzenal: sex · ~2 dias em novembro",
    );
  });

  it("asks for days when the chosen kind is still empty", () => {
    expect(scheduleSummaryLine(weekly([]), "2026-10", "2026-01-01")).toBe("escolha os dias");
  });

  it("formats attendance per kind", () => {
    expect(attendanceText({ daysWorked: 2, expectedDays: 9 }, "weekly")).toBe("2 de 9");
    expect(attendanceText({ daysWorked: 1, expectedDays: 2 }, "per_month")).toBe("1 de 2");
    expect(attendanceText({ daysWorked: 3, expectedDays: 0 }, "on_demand")).toBe("3");
    expect(attendanceLabel("per_month")).toBe("Visitas");
    expect(attendanceLabel("weekly")).toBe("Dias trabalhados");
  });
});
