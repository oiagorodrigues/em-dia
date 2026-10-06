import { describe, expect, it } from "vite-plus/test";
import { maskTime, nearestSlot, normalizeTime, timeSlots } from "./timeinput.ts";

describe("time input", () => {
  it("masks digits into HH:MM as you type", () => {
    expect(maskTime("8")).toBe("8");
    expect(maskTime("083")).toBe("08:3");
    expect(maskTime("0830")).toBe("08:30");
    expect(maskTime("08:305")).toBe("08:30");
    expect(maskTime("ab12")).toBe("12");
  });

  it("reads lenient times", () => {
    expect(normalizeTime("8")).toBe("08:00");
    expect(normalizeTime("830")).toBe("08:30");
    expect(normalizeTime("8:5")).toBe("08:05");
    expect(normalizeTime("8h30")).toBe("08:30");
    expect(normalizeTime("17:45")).toBe("17:45");
    expect(normalizeTime("24:00")).toBeNull();
    expect(normalizeTime("12:60")).toBeNull();
    expect(normalizeTime("abc")).toBeNull();
    expect(normalizeTime("")).toBeNull();
  });

  it("lists slots and finds the nearest one", () => {
    const slots = timeSlots(15);
    expect(slots).toHaveLength(96);
    expect(slots[33]).toBe("08:15");
    expect(slots[nearestSlot(slots, "08:20")]).toBe("08:30");
    expect(slots[nearestSlot(slots, null)]).toBe("08:00");
  });
});
