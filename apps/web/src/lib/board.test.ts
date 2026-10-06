import type { EntryStatus, WorkEntry } from "@emdia/shared";
import { describe, expect, it } from "vite-plus/test";
import { boardCells, cellKind, matchesBoardStatus, stripDates } from "./board.ts";

function entry(date: string, status: EntryStatus, minutes = 0): WorkEntry {
  return {
    id: date,
    contractId: "c",
    date,
    status,
    checkIn: status === "worked" ? "08:00" : null,
    checkOut: status === "worked" && minutes ? "16:00" : null,
    breakMinutes: 0,
    minutes,
    note: null,
    createdBy: "u",
    createdByRole: "employer",
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

const summary = {
  expectedDates: ["2026-10-02", "2026-10-05", "2026-10-09"],
  unrecordedDates: ["2026-10-05"],
};
const period = { startedOn: "2026-10-02", endedOn: null };

describe("cellKind", () => {
  it("maps entry statuses to board colors", () => {
    expect(cellKind("2026-10-02", entry("2026-10-02", "worked", 480), summary, period)).toBe(
      "worked",
    );
    expect(cellKind("2026-10-02", entry("2026-10-02", "absent"), summary, period)).toBe("absent");
    for (const s of ["excused", "day_off", "holiday"] as const)
      expect(cellKind("2026-10-02", entry("2026-10-02", s), summary, period)).toBe("soft");
  });

  it("uses the summary for expected days without an entry", () => {
    expect(cellKind("2026-10-05", null, summary, period)).toBe("missing");
    expect(cellKind("2026-10-09", null, summary, period)).toBe("planned");
    expect(cellKind("2026-10-06", null, summary, period)).toBe("none");
  });

  it("marks days outside the contract period", () => {
    expect(cellKind("2026-10-01", null, summary, period)).toBe("outside");
    expect(
      cellKind("2026-10-20", null, summary, { startedOn: "2026-01-01", endedOn: "2026-10-15" }),
    ).toBe("outside");
  });
});

describe("boardCells", () => {
  it("builds one cell per day with tooltips and screen-reader labels", () => {
    const cells = boardCells(
      "2026-10",
      [entry("2026-10-02", "worked", 480), entry("2026-10-07", "absent")],
      summary,
      period,
      "2026-10-06",
    );
    expect(cells).toHaveLength(31);
    const worked = cells[1]!;
    expect(worked.tip).toBe("8h");
    expect(worked.label).toBe("sex, 2 de outubro: trabalhou 8h");
    expect(cells[3]!.isWeekend).toBe(true);
    expect(cells[5]!.isToday).toBe(true);
    expect(cells[6]!.label).toBe("qua, 7 de outubro: faltou");
    expect(cells[4]!.label).toBe("seg, 5 de outubro: previsto, sem registro");
  });
});

describe("stripDates", () => {
  it("is the Monday-first week of today", () => {
    expect(stripDates("2026-10", "2026-10-07")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("uses the month's last week for a past month and its first week for a future one", () => {
    expect(stripDates("2026-09", "2026-10-07")[0]).toBe("2026-09-28");
    expect(stripDates("2026-11", "2026-10-07")[0]).toBe("2026-10-26");
  });
});

describe("matchesBoardStatus", () => {
  it("defaults to active people", () => {
    expect(matchesBoardStatus({ status: "active" }, "")).toBe(true);
    expect(matchesBoardStatus({ status: "ended" }, "")).toBe(false);
    expect(matchesBoardStatus({ status: "ended" }, "encerrados")).toBe(true);
    expect(matchesBoardStatus({ status: "active" }, "encerrados")).toBe(false);
    expect(matchesBoardStatus({ status: "ended" }, "todos")).toBe(true);
  });
});
