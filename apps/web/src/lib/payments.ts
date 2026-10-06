import type { Contract, Payment } from "@emdia/shared";

export interface PaymentRow {
  payment: Payment;
  contract: Contract;
  /** Description of the agreement a compensation pays down, e.g. "Mesa de jantar". */
  agreement?: string | null;
}

/** Filters of the Pagamentos page; "" means "todos". */
export interface PaymentFilters {
  pessoa: string;
  forma: string;
  recebido: string;
}

export function matchesPaymentFilters(row: PaymentRow, f: Partial<PaymentFilters>): boolean {
  if (f.pessoa && row.contract.id !== f.pessoa) return false;
  if (f.forma && row.payment.method !== f.forma) return false;
  if (f.recebido === "sim" && !row.payment.acknowledgedAt) return false;
  if (f.recebido === "nao" && row.payment.acknowledgedAt) return false;
  return true;
}

export interface PaymentTotals {
  count: number;
  cents: number;
  acknowledged: number;
}

export function paymentTotals(rows: readonly PaymentRow[]): PaymentTotals {
  return rows.reduce(
    (t, r) => ({
      count: t.count + 1,
      cents: t.cents + r.payment.amountCents,
      acknowledged: t.acknowledged + (r.payment.acknowledgedAt ? 1 : 0),
    }),
    { count: 0, cents: 0, acknowledged: 0 },
  );
}

/** Years with possible payments, newest first: from the oldest contract start up to this year. */
export function paymentYears(
  contracts: readonly Pick<Contract, "startedOn">[],
  thisYear: number,
): number[] {
  const first = contracts.reduce(
    (min, c) => Math.min(min, Number(c.startedOn.slice(0, 4))),
    thisYear,
  );
  return Array.from({ length: thisYear - first + 1 }, (_, i) => thisYear - i);
}
