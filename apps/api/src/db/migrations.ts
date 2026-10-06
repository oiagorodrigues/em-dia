import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { max } from "drizzle-orm";
import { bigint, pgSchema } from "drizzle-orm/pg-core";
import journal from "../../drizzle/meta/_journal.json" with { type: "json" };
import type { Executor } from "./database.ts";

/**
 * `drizzle/` sits next to `src/` and `dist/`; this module runs from either
 * (tsx and tests from src/db, the bundle from dist/).
 */
export function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "..", "drizzle"), join(here, "..", "..", "drizzle")]) {
    if (existsSync(join(candidate, "meta", "_journal.json"))) return candidate;
  }
  throw new Error(`drizzle migrations folder not found near ${here}`);
}

/** Drizzle's own bookkeeping table (not part of schema.ts, so drizzle-kit leaves it alone). */
const applied = pgSchema("drizzle").table("__drizzle_migrations", {
  createdAt: bigint("created_at", { mode: "number" }),
});

/**
 * Migrations the database has not applied yet, judged like Drizzle's migrator
 * does (by each journal entry's timestamp). Reads the journal bundled into the
 * code, so it needs no files at runtime.
 */
export async function pendingMigrations(db: Executor): Promise<string[]> {
  let last = 0;
  try {
    const [row] = await db.select({ last: max(applied.createdAt) }).from(applied);
    last = row?.last ?? 0;
  } catch {
    // No migrations table yet: nothing has been applied.
  }
  return journal.entries.filter((entry) => entry.when > last).map((entry) => entry.tag);
}
