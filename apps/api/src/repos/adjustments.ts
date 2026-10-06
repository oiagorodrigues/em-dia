import type { Adjustment, AdjustmentKind, YearMonth } from "@emdia/shared";
import type { Executor } from "../db/index.ts";

interface Row {
  id: string;
  contract_id: string;
  month: string;
  kind: AdjustmentKind;
  amount_cents: number;
  description: string | null;
  created_by: string;
  created_at: string;
}

const toAdjustment = (r: Row): Adjustment => ({
  id: r.id,
  contractId: r.contract_id,
  month: r.month,
  kind: r.kind,
  amountCents: r.amount_cents,
  description: r.description,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export function adjustmentsRepo(db: Executor) {
  return {
    async listByMonth(contractId: string, month: YearMonth): Promise<Adjustment[]> {
      return (
        await db.all<Row>(
          "SELECT * FROM adjustments WHERE contract_id = ? AND month = ? ORDER BY created_at, id",
          contractId,
          month,
        )
      ).map(toAdjustment);
    },

    async find(contractId: string, id: string): Promise<Adjustment | undefined> {
      const r = await db.get<Row>(
        "SELECT * FROM adjustments WHERE contract_id = ? AND id = ?",
        contractId,
        id,
      );
      return r && toAdjustment(r);
    },

    async insert(a: Adjustment): Promise<void> {
      await db.run(
        `INSERT INTO adjustments (id, contract_id, month, kind, amount_cents, description, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        a.id,
        a.contractId,
        a.month,
        a.kind,
        a.amountCents,
        a.description,
        a.createdBy,
        a.createdAt,
      );
    },

    async delete(id: string): Promise<void> {
      await db.run("DELETE FROM adjustments WHERE id = ?", id);
    },
  };
}
