import type { Household } from "@emdia/shared";
import { asc, eq } from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { households } from "../db/schema.ts";
import { date, iso } from "./convert.ts";

const toHousehold = (r: typeof households.$inferSelect): Household => ({
  ...r,
  createdAt: iso(r.createdAt),
});

export function householdsRepo(db: Executor) {
  return {
    async listByOwner(ownerId: string): Promise<Household[]> {
      const rows = await db
        .select()
        .from(households)
        .where(eq(households.ownerId, ownerId))
        .orderBy(asc(households.createdAt), asc(households.id));
      return rows.map(toHousehold);
    },

    async findById(id: string): Promise<Household | undefined> {
      const [r] = await db.select().from(households).where(eq(households.id, id));
      return r && toHousehold(r);
    },

    async insert(h: Household): Promise<void> {
      await db.insert(households).values({ ...h, createdAt: date(h.createdAt) });
    },

    async update(id: string, p: { name: string; timezone: string }): Promise<void> {
      await db.update(households).set(p).where(eq(households.id, id));
    },
  };
}
