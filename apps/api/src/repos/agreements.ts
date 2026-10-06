import type { Agreement } from "@emdia/shared";
import { and, desc, asc, eq, getTableColumns, isNull, sql, type SQL } from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { agreements, payments } from "../db/schema.ts";
import { date, dateOrNull, iso, isoOrNull } from "./convert.ts";

export type NewAgreement = Omit<Agreement, "settledCents" | "remainingCents">;

export function agreementsRepo(db: Executor) {
  /** settled is derived from the compensation payments that point at the agreement. */
  async function select(where: SQL | undefined): Promise<Agreement[]> {
    const settled = db
      .select({
        agreementId: payments.agreementId,
        cents: sql<number>`sum(${payments.amountCents})`.as("cents"),
      })
      .from(payments)
      .groupBy(payments.agreementId)
      .as("settled");
    const rows = await db
      .select({
        ...getTableColumns(agreements),
        settledCents: sql<number>`coalesce(${settled.cents}, 0)`.mapWith(Number),
      })
      .from(agreements)
      .leftJoin(settled, eq(settled.agreementId, agreements.id))
      .where(where)
      .orderBy(desc(agreements.createdAt), asc(agreements.id));
    return rows.map((r) => ({
      ...r,
      remainingCents: Math.max(0, r.totalCents - r.settledCents),
      acceptedAt: isoOrNull(r.acceptedAt),
      cancelledAt: isoOrNull(r.cancelledAt),
      createdAt: iso(r.createdAt),
    }));
  }

  return {
    list: (contractId: string): Promise<Agreement[]> =>
      select(eq(agreements.contractId, contractId)),

    async find(contractId: string, id: string): Promise<Agreement | undefined> {
      return (await select(and(eq(agreements.contractId, contractId), eq(agreements.id, id))))[0];
    },

    async insert(a: NewAgreement): Promise<void> {
      await db.insert(agreements).values({
        ...a,
        acceptedAt: dateOrNull(a.acceptedAt),
        cancelledAt: dateOrNull(a.cancelledAt),
        createdAt: date(a.createdAt),
      });
    },

    async accept(id: string, at: string): Promise<void> {
      await db
        .update(agreements)
        .set({ acceptedAt: date(at) })
        .where(and(eq(agreements.id, id), isNull(agreements.acceptedAt)));
    },

    async cancel(id: string, at: string): Promise<void> {
      await db
        .update(agreements)
        .set({ cancelledAt: date(at) })
        .where(and(eq(agreements.id, id), isNull(agreements.cancelledAt)));
    },
  };
}
