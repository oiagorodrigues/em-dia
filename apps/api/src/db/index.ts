import { createLibsqlDatabase } from "./libsql.ts";
import { migrations, type Migration } from "./migrations/index.ts";
import { createNodeSqliteDatabase } from "./node-sqlite.ts";
import type { Database } from "./driver.ts";

export type { Database, Executor, Param } from "./driver.ts";

const REMOTE_SCHEMES = /^(libsql|https?|wss?):\/\//;

export const isRemoteDatabaseUrl = (url: string) => REMOTE_SCHEMES.test(url);

/** `libsql://…` (Turso) uses libSQL; a path, `file:` path or `:memory:` uses node:sqlite. */
export function openDatabase(url: string, authToken?: string): Database {
  if (isRemoteDatabaseUrl(url)) return createLibsqlDatabase(url, authToken);
  return createNodeSqliteDatabase(url.replace(/^file:/, ""));
}

/**
 * Applies pending migrations, each in its own write transaction that re-checks
 * the migrations table first, so concurrent runs (two deploys building at once)
 * apply each migration exactly once. Returns the ids applied by this run.
 */
export async function migrate(
  db: Database,
  list: readonly Migration[] = migrations,
): Promise<string[]> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT",
  );
  const applied: string[] = [];
  for (const m of list) {
    const ran = await db.transaction(async (tx) => {
      if (await tx.get("SELECT 1 AS hit FROM migrations WHERE id = ?", m.id)) return false;
      await tx.exec(m.sql);
      await tx.run(
        "INSERT INTO migrations (id, applied_at) VALUES (?, ?)",
        m.id,
        new Date().toISOString(),
      );
      return true;
    });
    if (ran) applied.push(m.id);
  }
  return applied;
}

/** Migrations not yet applied; the serverless entry refuses to guess and reports them. */
export async function pendingMigrations(
  db: Database,
  list: readonly Migration[] = migrations,
): Promise<string[]> {
  const table = await db.get(
    "SELECT 1 AS hit FROM sqlite_master WHERE type = 'table' AND name = 'migrations'",
  );
  if (!table) return list.map((m) => m.id);
  const done = new Set(
    (await db.all<{ id: string }>("SELECT id FROM migrations")).map((r) => r.id),
  );
  return list.map((m) => m.id).filter((id) => !done.has(id));
}
