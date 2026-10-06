import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./database.ts";
import { migrationsFolder, pendingMigrations } from "./migrations.ts";
import * as schema from "./schema.ts";

const LOCK_FILE = ".emdia-pid";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * PGlite is an embedded, single-process Postgres. Two processes on one data
 * directory would corrupt it, so the directory is claimed with a pid file.
 */
function claim(dir: string): () => void {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, LOCK_FILE);
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    if (pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `PGlite data dir ${dir} is in use by process ${pid} (stop the API before seeding or migrating)`,
      );
    }
  }
  writeFileSync(lock, String(process.pid));
  const release = () => rmSync(lock, { force: true });
  process.once("exit", release);
  return release;
}

/** `dir` null means in memory (tests). */
export async function createPgliteDatabase(dir: string | null): Promise<Database> {
  const release = dir ? claim(dir) : () => undefined;
  const client = await PGlite.create(dir ?? "memory://");
  const db = drizzle({ client, schema });
  // One session, so an advisory lock would not serialise callers; queue them instead.
  let migrating: Promise<string[]> = Promise.resolve([]);

  return {
    driver: "pglite",
    db,
    transaction: (fn) => db.transaction((tx) => fn(tx)),
    migrate() {
      migrating = migrating
        .catch(() => [])
        .then(async () => {
          const pending = await pendingMigrations(db);
          await migrate(db, { migrationsFolder: migrationsFolder() });
          return pending;
        });
      return migrating;
    },
    async close() {
      await client.close();
      release();
    },
  };
}
