import type { Adjustment, YearMonth } from "@emdia/shared";
import { and, asc, eq } from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { adjustments } from "../db/schema.ts";
import { date, iso } from "./convert.ts";

const toAdjustment = (r: typeof adjustments.$inferSelect): Adjustment => ({
  ...r,
  createdAt: iso(r.createdAt),
});

export function adjustmentsRepo(db: Executor) {
  return {
    async listByMonth(contractId: string, month: YearMonth): Promise<Adjustment[]> {
      const rows = await db
        .select()
        .from(adjustments)
        .where(and(eq(adjustments.contractId, contractId), eq(adjustments.month, month)))
        .orderBy(asc(adjustments.createdAt), asc(adjustments.id));
      return rows.map(toAdjustment);
    },

    async find(contractId: string, id: string): Promise<Adjustment | undefined> {
      const [r] = await db
        .select()
        .from(adjustments)
        .where(and(eq(adjustments.contractId, contractId), eq(adjustments.id, id)));
      return r && toAdjustment(r);
    },

    async insert(a: Adjustment): Promise<void> {
      await db.insert(adjustments).values({ ...a, createdAt: date(a.createdAt) });
    },

    async delete(id: string): Promise<void> {
      await db.delete(adjustments).where(eq(adjustments.id, id));
    },
  };
}
