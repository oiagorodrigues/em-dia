import { describe, expect, it } from "vite-plus/test";
import { inRange, isoToBr, maskDate, monthGrid, parseBrDate } from "./dateinput.ts";

describe("date input", () => {
  it("masks digits into DD/MM/AAAA", () => {
    expect(maskDate("06")).toBe("06");
    expect(maskDate("0610")).toBe("06/10");
    expect(maskDate("06102026")).toBe("06/10/2026");
    expect(maskDate("06/10/20261")).toBe("06/10/2026");
  });

  it("parses only real dates", () => {
    expect(parseBrDate("06/10/2026")).toBe("2026-10-06");
    expect(parseBrDate("31/02/2026")).toBeNull();
    expect(parseBrDate("06/10/26")).toBeNull();
    expect(isoToBr("2026-10-06")).toBe("06/10/2026");
    expect(isoToBr("")).toBe("");
  });

  it("builds a Sunday-first month grid padded with neighbouring days", () => {
    const weeks = monthGrid("2026-10");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toEqual({ date: "2026-09-27", day: 27, inMonth: false });
    expect(weeks[0]![4]).toEqual({ date: "2026-10-01", day: 1, inMonth: true });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });

  it("checks min/max", () => {
    expect(inRange("2026-10-06", "2026-10-01", "2026-10-31")).toBe(true);
    expect(inRange("2026-09-30", "2026-10-01")).toBe(false);
  });
});
