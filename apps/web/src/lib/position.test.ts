import { describe, expect, it } from "vite-plus/test";
import { placeFloating } from "./position.ts";

const viewport = { width: 1000, height: 800 };
const tip = { width: 100, height: 30 };

describe("placeFloating", () => {
  it("centers above the anchor when there is room", () => {
    expect(
      placeFloating({ top: 400, left: 450, width: 100, height: 40 }, tip, viewport, "top"),
    ).toEqual({
      top: 362,
      left: 450,
      side: "top",
    });
  });

  it("flips below when the top would clip", () => {
    const p = placeFloating({ top: 10, left: 450, width: 100, height: 40 }, tip, viewport, "top");
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(58);
  });

  it("flips above when the bottom would clip a menu", () => {
    const p = placeFloating(
      { top: 770, left: 450, width: 40, height: 20 },
      { width: 200, height: 120 },
      viewport,
      "bottom",
    );
    expect(p.side).toBe("top");
    expect(p.top).toBe(770 - 8 - 120);
  });

  it("is pushed back inside the left and right edges", () => {
    expect(placeFloating({ top: 400, left: 0, width: 20, height: 20 }, tip, viewport).left).toBe(8);
    expect(placeFloating({ top: 400, left: 990, width: 10, height: 20 }, tip, viewport).left).toBe(
      1000 - 8 - 100,
    );
  });

  it("aligns to the anchor's start or end edge", () => {
    const a = { top: 100, left: 300, width: 200, height: 40 };
    expect(placeFloating(a, tip, viewport, "bottom", 4, 8, "start").left).toBe(300);
    expect(placeFloating(a, tip, viewport, "bottom", 4, 8, "end").left).toBe(400);
  });

  it("places beside the anchor on the right, and above when the right has no room", () => {
    const a = { top: 100, left: 20, width: 40, height: 40 };
    expect(placeFloating(a, tip, viewport, "right")).toEqual({
      top: 100 + 20 - tip.height / 2,
      left: 68,
      side: "right",
    });
    const edge = { top: 400, left: viewport.width - 30, width: 20, height: 20 };
    expect(placeFloating(edge, tip, viewport, "right").side).toBe("top");
  });
});
