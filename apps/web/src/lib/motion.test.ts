import { describe, expect, it } from "vite-plus/test";
import { countAt, staggerDelay } from "./motion.ts";

describe("motion helpers", () => {
  it("counts with an ease-out curve and lands exactly on the target", () => {
    expect(countAt(0, 100, 0, 600)).toBe(0);
    expect(countAt(0, 100, 300, 600)).toBeGreaterThan(50);
    expect(countAt(0, 100, 600, 600)).toBe(100);
    expect(countAt(100, 40, 900, 600)).toBe(40);
  });

  it("staggers 20ms per item, capped at 8 items", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBe(60);
    expect(staggerDelay(40)).toBe(160);
  });
});
