import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { Database } from "./database.ts";
import { migrationsFolder, pendingMigrations } from "./migrations.ts";
import * as schema from "./schema.ts";

/** Arbitrary but fixed: every migrator, in any process, waits on the same key. */
const MIGRATION_LOCK_KEY = 4_220_726;

export interface PostgresOptions {
  /** Called once with the pool, e.g. Vercel's attachDatabasePool on Fluid compute. */
  onPool?: (pool: Pool) => void;
}

/** node-postgres over TCP: Neon (pooled URL at runtime) and any self-hosted Postgres. */
export function createPostgresDatabase(url: string, { onPool }: PostgresOptions = {}): Database {
  const pool = new Pool({ connectionString: url });
  onPool?.(pool);
  const db = drizzle({ client: pool, schema });

  return {
    driver: "node-postgres",
    db,
    transaction: (fn) => db.transaction((tx) => fn(tx)),

    // A session-level advisory lock serialises concurrent deploys; it needs a
    // direct connection (Neon's pooler runs in transaction mode).
    async migrate() {
      const client = await pool.connect();
      try {
        await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
        try {
          const locked = drizzle({ client, schema });
          const pending = await pendingMigrations(locked);
          await migrate(locked, { migrationsFolder: migrationsFolder() });
          return pending;
        } finally {
          await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
        }
      } finally {
        client.release();
      }
    },

    close: () => pool.end(),
  };
}
