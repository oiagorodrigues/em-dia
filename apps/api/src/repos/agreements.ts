import type { Agreement } from "@emdia/shared";
import { execute, queryAll, queryOne, type Db } from "../db/index.ts";

interface Row {
  id: string;
  contract_id: string;
  description: string;
  total_cents: number;
  installment_cents: number | null;
  start_month: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
  settled_cents: number;
}

/** settled is derived from the compensation payments that point at the agreement. */
const SELECT = `
  SELECT a.*, COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.agreement_id = a.id), 0) AS settled_cents
  FROM agreements a`;

const toAgreement = (r: Row): Agreement => ({
  id: r.id,
  contractId: r.contract_id,
  description: r.description,
  totalCents: r.total_cents,
  installmentCents: r.installment_cents,
  startMonth: r.start_month,
  settledCents: r.settled_cents,
  remainingCents: Math.max(0, r.total_cents - r.settled_cents),
  acceptedAt: r.accepted_at,
  cancelledAt: r.cancelled_at,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export type NewAgreement = Omit<Agreement, "settledCents" | "remainingCents">;

export function agreementsRepo(db: Db) {
  return {
    list(contractId: string): Agreement[] {
      return queryAll<Row>(
        db,
        `${SELECT} WHERE a.contract_id = ? ORDER BY a.created_at DESC, a.id`,
        contractId,
      ).map(toAgreement);
    },

    find(contractId: string, id: string): Agreement | undefined {
      const r = queryOne<Row>(db, `${SELECT} WHERE a.contract_id = ? AND a.id = ?`, contractId, id);
      return r && toAgreement(r);
    },

    insert(a: NewAgreement): void {
      execute(
        db,
        `INSERT INTO agreements (id, contract_id, description, total_cents, installment_cents, start_month,
           accepted_at, cancelled_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.id,
        a.contractId,
        a.description,
        a.totalCents,
        a.installmentCents,
        a.startMonth,
        a.acceptedAt,
        a.cancelledAt,
        a.createdBy,
        a.createdAt,
      );
    },

    accept(id: string, at: string): void {
      execute(
        db,
        "UPDATE agreements SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL",
        at,
        id,
      );
    },

    cancel(id: string, at: string): void {
      execute(
        db,
        "UPDATE agreements SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL",
        at,
        id,
      );
    },
  };
}
