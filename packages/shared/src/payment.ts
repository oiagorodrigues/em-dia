import type { Payment } from "./domain.ts";

type KindAndMethod = Pick<Payment, "kind" | "method">;

/** Money changed hands in this entry, so the worker can say "recebi" and it can carry a receipt. */
export function handsMoney(p: KindAndMethod): boolean {
  return p.method !== null;
}

/**
 * Counts in the month's paid total. An adiantamento never does by itself: its days
 * count as paid when they are abated, through the compensation payments linked to it.
 */
export function countsAsPaid(p: KindAndMethod): boolean {
  return p.method !== null && p.kind !== "advance";
}

/** An adiantamento with something left to abate. */
export function isOpenAdvance(p: Pick<Payment, "kind" | "remainingCents">): boolean {
  return p.kind === "advance" && (p.remainingCents ?? 0) > 0;
}
