/** Formats what's typed so far: "8" → "8", "083" → "08:3", "0830" → "08:30". Digits only, colon inserted. */
export function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/**
 * Reads a typed time leniently: "8" → 08:00, "830" → 08:30, "8:5" → 08:05, "8h30" → 08:30.
 * Returns null when it isn't a valid 24h time.
 */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let h: number;
  let m: number;
  const sep = /^(\d{1,2})\s*[:h.]\s*(\d{0,2})$/.exec(s);
  if (sep) {
    h = Number(sep[1]);
    m = sep[2] ? Number(sep[2]) : 0;
  } else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) {
      h = Number(s);
      m = 0;
    } else {
      h = Number(s.slice(0, s.length - 2));
      m = Number(s.slice(-2));
    }
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "00:00", "00:15", … for the slot list. */
export function timeSlots(step = 15): string[] {
  const out: string[] = [];
  for (let t = 0; t < 24 * 60; t += step) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

/** Index of the slot at or right after `time`, so the list opens scrolled near the value. */
export function nearestSlot(slots: readonly string[], time: string | null): number {
  if (!time) return slots.findIndex((s) => s === "08:00");
  const i = slots.findIndex((s) => s >= time);
  return i < 0 ? slots.length - 1 : i;
}
