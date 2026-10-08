import { describe, expect, it } from "vite-plus/test";
import {
  addDays,
  daysBetween,
  formatDuration,
  nightMinutes,
  stayMinutes,
  isValidIsoDate,
  nowInZone,
  parseMoneyToCents,
  shiftMinutes,
  shiftMonth,
  weekdayOf,
} from "../src/index.ts";

describe("time helpers", () => {
  it("validates real dates", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
  });
  it("computes shift minutes including overnight", () => {
    expect(shiftMinutes("08:00", "17:00", 60)).toBe(480);
    expect(shiftMinutes("22:00", "06:00")).toBe(480);
  });
  it("shifts months across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0h");
    expect(formatDuration(5200)).toBe("86h40");
  });
  it("knows weekdays", () => {
    expect(weekdayOf("2026-10-06")).toBe(2);
  });
  it("reads clock in a timezone", () => {
    expect(nowInZone("America/Sao_Paulo", new Date("2026-10-06T02:30:00Z"))).toEqual({
      date: "2026-10-05",
      time: "23:30",
    });
  });
  it("parses BRL money", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("R$ 180")).toBe(18000);
    expect(parseMoneyToCents("12.5")).toBe(1250);
    expect(parseMoneyToCents("abc")).toBeNull();
  });
});

describe("stays that cross days", () => {
  const stay = (
    checkIn: string,
    checkOut: string,
    checkOutDate: string | null,
    breakMinutes = 0,
  ) => ({
    date: "2026-10-09",
    checkIn,
    checkOut,
    checkOutDate,
    breakMinutes,
  });

  it("counts a Friday-to-Monday plantão as 72 hours", () => {
    expect(stayMinutes(stay("08:00", "08:00", "2026-10-12"))).toBe(72 * 60);
    expect(stayMinutes(stay("08:00", "08:00", "2026-10-12", 120))).toBe(70 * 60);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetween("2026-10-09", "2026-10-12")).toBe(3);
  });

  it("keeps the next-morning rule without a check-out date", () => {
    expect(stayMinutes(stay("22:00", "06:00", null))).toBe(8 * 60);
  });

  it("counts the minutes between 22:00 and 05:00", () => {
    expect(nightMinutes(stay("08:00", "17:00", null))).toBe(0);
    expect(nightMinutes(stay("18:00", "23:30", null))).toBe(90);
    expect(nightMinutes(stay("22:00", "06:00", null))).toBe(7 * 60);
    expect(nightMinutes(stay("03:00", "09:00", null))).toBe(2 * 60);
    // Three nights in a Friday-to-Monday plantão.
    expect(nightMinutes(stay("08:00", "08:00", "2026-10-12"))).toBe(3 * 7 * 60);
  });

  it("never counts more night than work", () => {
    expect(nightMinutes(stay("22:00", "02:00", null, 300))).toBe(0);
  });
});
