import { ADJUSTMENT_SIGN, type Adjustment, type Payment, type YearMonth } from "@emdia/shared";

interface ExtraBase {
  id: string;
  month: YearMonth;
  description: string | null;
  createdAt: string;
}

/** A line of the Extras tab: an adjustment, or a payment flagged `isExtra`. */
export type ExtraRow =
  | (ExtraBase & { source: "adjustment"; adjustment: Adjustment })
  | (ExtraBase & { source: "payment"; payment: Payment });

export function extraRows(
  adjustments: readonly Adjustment[],
  payments: readonly Payment[],
  month: YearMonth,
): ExtraRow[] {
  return [
    ...adjustments.map((a): ExtraRow => ({
      source: "adjustment",
      id: `a:${a.id}`,
      month: a.month,
      description: a.description,
      createdAt: a.createdAt,
      adjustment: a,
    })),
    ...payments
      .filter((p) => p.isExtra && p.referenceMonth === month)
      .map((p): ExtraRow => ({
        source: "payment",
        id: `p:${p.id}`,
        month: p.referenceMonth,
        description: p.note,
        createdAt: p.createdAt,
        payment: p,
      })),
  ];
}

/** What the line adds to the month's due amount; an extra payment adds itself (and is paid). */
export function extraSigned(row: ExtraRow): number {
  return row.source === "payment"
    ? row.payment.amountCents
    : ADJUSTMENT_SIGN[row.adjustment.kind] * row.adjustment.amountCents;
}
