import type { IsoDate, WorkEntry, YearMonth } from "@emdia/shared";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { workEntries } from "../db/schema.ts";
import { date, dateOrNull, iso, isoOrNull } from "./convert.ts";
import { monthRange } from "./month.ts";

const toEntry = (r: typeof workEntries.$inferSelect): WorkEntry => ({
  ...r,
  confirmedAt: isoOrNull(r.confirmedAt),
  updatedAt: iso(r.updatedAt),
});

export function entriesRepo(db: Executor) {
  return {
    async listByMonth(contractId: string, month: YearMonth): Promise<WorkEntry[]> {
      const [from, to] = monthRange(month);
      const rows = await db
        .select()
        .from(workEntries)
        .where(
          and(
            eq(workEntries.contractId, contractId),
            gte(workEntries.date, from),
            lt(workEntries.date, to),
          ),
        )
        .orderBy(asc(workEntries.date));
      return rows.map(toEntry);
    },

    async find(contractId: string, day: IsoDate): Promise<WorkEntry | undefined> {
      const [r] = await db
        .select()
        .from(workEntries)
        .where(and(eq(workEntries.contractId, contractId), eq(workEntries.date, day)));
      return r && toEntry(r);
    },

    /** Insert or full replace of the (contract, date) row. */
    async save(e: WorkEntry): Promise<void> {
      const row = { ...e, confirmedAt: dateOrNull(e.confirmedAt), updatedAt: date(e.updatedAt) };
      const { id: _id, contractId: _contract, date: _date, ...changes } = row;
      await db
        .insert(workEntries)
        .values(row)
        .onConflictDoUpdate({ target: [workEntries.contractId, workEntries.date], set: changes });
    },

    async delete(contractId: string, day: IsoDate): Promise<void> {
      await db
        .delete(workEntries)
        .where(and(eq(workEntries.contractId, contractId), eq(workEntries.date, day)));
    },
  };
}
