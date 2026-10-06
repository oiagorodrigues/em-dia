import type { Household } from "@emdia/shared";
import type { Executor } from "../db/index.ts";

interface Row {
  id: string;
  owner_id: string;
  name: string;
  timezone: string;
  created_at: string;
}

const toHousehold = (r: Row): Household => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  timezone: r.timezone,
  createdAt: r.created_at,
});

export function householdsRepo(db: Executor) {
  return {
    async listByOwner(ownerId: string): Promise<Household[]> {
      return (
        await db.all<Row>(
          "SELECT * FROM households WHERE owner_id = ? ORDER BY created_at, id",
          ownerId,
        )
      ).map(toHousehold);
    },

    async findById(id: string): Promise<Household | undefined> {
      const r = await db.get<Row>("SELECT * FROM households WHERE id = ?", id);
      return r && toHousehold(r);
    },

    async insert(h: Household): Promise<void> {
      await db.run(
        "INSERT INTO households (id, owner_id, name, timezone, created_at) VALUES (?, ?, ?, ?, ?)",
        h.id,
        h.ownerId,
        h.name,
        h.timezone,
        h.createdAt,
      );
    },

    async update(id: string, p: { name: string; timezone: string }): Promise<void> {
      await db.run(
        "UPDATE households SET name = ?, timezone = ? WHERE id = ?",
        p.name,
        p.timezone,
        id,
      );
    },
  };
}
