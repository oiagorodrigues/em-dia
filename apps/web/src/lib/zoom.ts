/**
 * Pan and zoom for a picture fitted inside a box. `scale` 1 is "fit"; `x`/`y` translate the
 * picture from the box centre, in screen pixels. Points are relative to the box centre too.
 */
export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface Box {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
/** One press of a button or of + / -. */
export const ZOOM_STEP = 1.25;

export const ZOOM_FIT: ZoomState = { scale: 1, x: 0, y: 0 };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Keeps the zoomed picture covering the box: no panning past its edges, none at all at fit. */
export function clampPan(s: ZoomState, box: Box): ZoomState {
  const maxX = ((s.scale - 1) * box.width) / 2;
  const maxY = ((s.scale - 1) * box.height) / 2;
  return { scale: s.scale, x: clamp(s.x, -maxX, maxX) || 0, y: clamp(s.y, -maxY, maxY) || 0 };
}

/** Zooms to `scale` keeping `point` (under the cursor or between two fingers) where it is. */
export function zoomAt(s: ZoomState, scale: number, point: Point, box: Box): ZoomState {
  const next = clamp(scale, ZOOM_MIN, ZOOM_MAX);
  const ratio = next / s.scale;
  return clampPan(
    {
      scale: next,
      x: point.x - (point.x - s.x) * ratio,
      y: point.y - (point.y - s.y) * ratio,
    },
    box,
  );
}

export function panBy(s: ZoomState, dx: number, dy: number, box: Box): ZoomState {
  return clampPan({ scale: s.scale, x: s.x + dx, y: s.y + dy }, box);
}
