/** Hover delay before a tooltip shows, so passing the pointer over a toolbar doesn't flash labels. */
export const TOOLTIP_DELAY = 500;

/** After one tooltip closes, the next one within this window shows at once (scanning a toolbar). */
export const TOOLTIP_WARM_MS = 300;

let lastClosed = Number.NEGATIVE_INFINITY;

export const tooltipWarm = {
  cool(now = Date.now()): void {
    lastClosed = now;
  },
  isWarm(now = Date.now()): boolean {
    return now - lastClosed < TOOLTIP_WARM_MS;
  },
  reset(): void {
    lastClosed = Number.NEGATIVE_INFINITY;
  },
};
