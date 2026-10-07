export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Side = "top" | "bottom" | "right";

export interface Placement {
  top: number;
  left: number;
  side: Side;
}

/**
 * Where to put a floating element (tooltip, popover) next to `anchor` inside a viewport:
 * the preferred side when it fits, the other side when it doesn't, centered horizontally
 * and pushed back inside the viewport edges by `margin`. "right" sits beside the anchor,
 * centered vertically, and falls back to "top" when there is no room on the right.
 */
export function placeFloating(
  anchor: Rect,
  floating: Size,
  viewport: Size,
  preferred: Side = "top",
  gap = 8,
  margin = 8,
  align: "center" | "start" | "end" = "center",
): Placement {
  const right = anchor.left + anchor.width + gap;
  if (preferred === "right" && right + floating.width <= viewport.width - margin) {
    const middle = anchor.top + anchor.height / 2 - floating.height / 2;
    const top = Math.min(
      Math.max(middle, margin),
      Math.max(margin, viewport.height - margin - floating.height),
    );
    return { top: Math.round(top), left: Math.round(right), side: "right" };
  }
  const above = anchor.top - gap - floating.height;
  const below = anchor.top + anchor.height + gap;
  const fitsAbove = above >= margin;
  const fitsBelow = below + floating.height <= viewport.height - margin;

  let side: Side = preferred === "right" ? "top" : preferred;
  if (side === "top" && !fitsAbove && fitsBelow) side = "bottom";
  else if (side === "bottom" && !fitsBelow && fitsAbove) side = "top";

  let left =
    align === "start"
      ? anchor.left
      : align === "end"
        ? anchor.left + anchor.width - floating.width
        : anchor.left + anchor.width / 2 - floating.width / 2;
  left = Math.min(
    Math.max(left, margin),
    Math.max(margin, viewport.width - margin - floating.width),
  );

  let top = side === "top" ? above : below;
  top = Math.min(
    Math.max(top, margin),
    Math.max(margin, viewport.height - margin - floating.height),
  );
  return { top: Math.round(top), left: Math.round(left), side };
}
