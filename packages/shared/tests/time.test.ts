import { describe, expect, it } from "vite-plus/test";
import {
  formatDuration,
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
