import { describe, expect, it } from "vite-plus/test";
import { clampPan, panBy, zoomAt, ZOOM_FIT, ZOOM_MAX, ZOOM_MIN } from "./zoom.ts";

const BOX = { width: 400, height: 300 };

describe("zoom", () => {
  it("keeps the point under the cursor in place while zooming", () => {
    const point = { x: 100, y: -50 };
    const next = zoomAt(ZOOM_FIT, 2, point, BOX);
    expect(next).toEqual({ scale: 2, x: -100, y: 50 });
    // At fit the picture point under the cursor is the cursor itself; it must stay there.
    expect(next.x + next.scale * point.x).toBe(point.x);
    expect(next.y + next.scale * point.y).toBe(point.y);
  });

  it("stays between fit and the maximum", () => {
    expect(zoomAt(ZOOM_FIT, 0.5, { x: 0, y: 0 }, BOX).scale).toBe(ZOOM_MIN);
    expect(zoomAt(ZOOM_FIT, 40, { x: 0, y: 0 }, BOX).scale).toBe(ZOOM_MAX);
  });

  it("does not pan past the edges, and not at all at fit", () => {
    expect(panBy(ZOOM_FIT, 50, 50, BOX)).toEqual(ZOOM_FIT);
    const at2 = { scale: 2, x: 0, y: 0 };
    expect(panBy(at2, 999, -999, BOX)).toEqual({ scale: 2, x: 200, y: -150 });
    expect(clampPan({ scale: 2, x: 10, y: 10 }, BOX)).toEqual({ scale: 2, x: 10, y: 10 });
  });

  it("recentres when zooming back out to fit", () => {
    const zoomed = { scale: 3, x: 300, y: -200 };
    expect(zoomAt(zoomed, 1, { x: 0, y: 0 }, BOX)).toEqual(ZOOM_FIT);
  });
});
