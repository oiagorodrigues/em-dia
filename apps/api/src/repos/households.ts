import type { Household } from "@emdia/shared";
import { execute, queryAll, queryOne, type Db } from "../db/index.ts";

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

export function householdsRepo(db: Db) {
  return {
    listByOwner(ownerId: string): Household[] {
      return queryAll<Row>(
        db,
        "SELECT * FROM households WHERE owner_id = ? ORDER BY created_at, id",
        ownerId,
      ).map(toHousehold);
    },

    findById(id: string): Household | undefined {
      const r = queryOne<Row>(db, "SELECT * FROM households WHERE id = ?", id);
      return r && toHousehold(r);
    },

    insert(h: Household): void {
      execute(
        db,
        "INSERT INTO households (id, owner_id, name, timezone, created_at) VALUES (?, ?, ?, ?, ?)",
        h.id,
        h.ownerId,
        h.name,
        h.timezone,
        h.createdAt,
      );
    },

    update(id: string, p: { name: string; timezone: string }): void {
      execute(
        db,
        "UPDATE households SET name = ?, timezone = ? WHERE id = ?",
        p.name,
        p.timezone,
        id,
      );
    },

    deleteByOwner(ownerId: string): void {
      execute(db, "DELETE FROM households WHERE owner_id = ?", ownerId);
    },
  };
}
