import type { Adjustment, AdjustmentKind, YearMonth } from "@ponto/shared";
import { execute, queryAll, queryOne, type Db } from "../db/index.ts";

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

export function adjustmentsRepo(db: Db) {
  return {
    listByMonth(contractId: string, month: YearMonth): Adjustment[] {
      return queryAll<Row>(
        db,
        "SELECT * FROM adjustments WHERE contract_id = ? AND month = ? ORDER BY created_at, id",
        contractId,
        month,
      ).map(toAdjustment);
    },

    find(contractId: string, id: string): Adjustment | undefined {
      const r = queryOne<Row>(
        db,
        "SELECT * FROM adjustments WHERE contract_id = ? AND id = ?",
        contractId,
        id,
      );
      return r && toAdjustment(r);
    },

    insert(a: Adjustment): void {
      execute(
        db,
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

    delete(id: string): void {
      execute(db, "DELETE FROM adjustments WHERE id = ?", id);
    },
  };
}
