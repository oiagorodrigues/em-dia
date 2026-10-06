import type { Agreement } from "@emdia/shared";
import type { Executor } from "../db/index.ts";

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

export function agreementsRepo(db: Executor) {
  return {
    async list(contractId: string): Promise<Agreement[]> {
      return (
        await db.all<Row>(
          `${SELECT} WHERE a.contract_id = ? ORDER BY a.created_at DESC, a.id`,
          contractId,
        )
      ).map(toAgreement);
    },

    async find(contractId: string, id: string): Promise<Agreement | undefined> {
      const r = await db.get<Row>(`${SELECT} WHERE a.contract_id = ? AND a.id = ?`, contractId, id);
      return r && toAgreement(r);
    },

    async insert(a: NewAgreement): Promise<void> {
      await db.run(
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

    async accept(id: string, at: string): Promise<void> {
      await db.run(
        "UPDATE agreements SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL",
        at,
        id,
      );
    },

    async cancel(id: string, at: string): Promise<void> {
      await db.run(
        "UPDATE agreements SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL",
        at,
        id,
      );
    },
  };
}
