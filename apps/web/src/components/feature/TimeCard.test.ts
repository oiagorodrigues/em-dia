import type { WorkEntry } from "@ponto/shared";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import TimeCard from "./TimeCard.vue";

function entry(date: string, patch: Partial<WorkEntry> = {}): WorkEntry {
  return {
    id: `e-${date}`,
    contractId: "c1",
    date,
    status: "worked",
    checkIn: "08:00",
    checkOut: "17:00",
    breakMinutes: 60,
    minutes: 480,
    note: null,
    createdBy: "u1",
    createdByRole: "worker",
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: "2026-10-01T12:00:00Z",
    ...patch,
  };
}

// October 2026: the 1st is a Thursday. Schedule Mon/Wed/Fri.
const contract = { scheduleDays: [1, 3, 5], startedOn: "2026-10-01", endedOn: null };

function render(entries: WorkEntry[], today = "2026-10-09") {
  return mount(TimeCard, { props: { month: "2026-10", entries, contract, today } });
}

describe("TimeCard", () => {
  it("renders one row per day of the month", () => {
    expect(render([]).findAll("li")).toHaveLength(31);
  });

  it("shows worked times in ink and the day total", () => {
    const row = render([entry("2026-10-02")]).findAll(".row")[1]!;
    expect(row.text()).toContain("08:00");
    expect(row.text()).toContain("17:00");
    expect(row.text()).toContain("1h");
    expect(row.find(".row__total").text()).toBe("8h");
    expect(row.attributes("aria-label")).toContain("total 8h");
  });

  it("stamps absences with an accessible label", () => {
    const card = render([
      entry("2026-10-05", { status: "absent", checkIn: null, checkOut: null, minutes: 0 }),
      entry("2026-10-07", { status: "holiday", checkIn: null, checkOut: null, minutes: 0 }),
    ]);
    const stamps = card.findAll(".stamp");
    expect(stamps.map((s) => s.text())).toEqual(["Falta", "Feriado"]);
    expect(stamps[0]!.attributes("aria-label")).toBe("Faltou");
    expect(stamps[0]!.classes()).toContain("stamp--red");
    expect(stamps[1]!.classes()).toContain("stamp--ink");
  });

  it("asks to register scheduled past days that have no entry, but not future ones", () => {
    const card = render([entry("2026-10-02")], "2026-10-09");
    const missing = card.findAll(".row--missing").map((r) => r.attributes("aria-label"));
    // Mon 5, Wed 7, Fri 9 are scheduled, past or today, and empty. Fri 2 has an entry.
    expect(missing).toHaveLength(3);
    expect(missing[0]).toContain("5 de outubro");
    expect(card.findAll(".row")[11]!.classes()).not.toContain("row--missing");
  });

  it("marks today, confirmation state and disables days outside the contract", () => {
    const card = mount(TimeCard, {
      props: {
        month: "2026-10",
        entries: [
          entry("2026-10-02", { confirmedAt: "2026-10-02T20:00:00Z", confirmedBy: "u2" }),
          entry("2026-10-09"),
        ],
        contract: { ...contract, startedOn: "2026-10-02" },
        today: "2026-10-09",
      },
    });
    const rows = card.findAll(".row");
    expect(rows[0]!.attributes("disabled")).toBeDefined();
    expect(rows[1]!.find(".dot--ok").exists()).toBe(true);
    expect(rows[8]!.classes()).toContain("is-today");
    expect(rows[8]!.attributes("aria-current")).toBe("date");
    expect(rows[8]!.find(".dot--open").exists()).toBe(true);
  });

  it("emits the date when a day is picked", async () => {
    const card = render([]);
    await card.findAll(".row")[4]!.trigger("click");
    expect(card.emitted("select")).toEqual([["2026-10-05"]]);
  });
});
