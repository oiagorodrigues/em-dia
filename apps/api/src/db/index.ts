import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { migrations, type Migration } from "./migrations/index.ts";

export type Db = DatabaseSync;
export type Param = SQLInputValue;

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(db: Db, list: readonly Migration[] = migrations): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT",
  );
  const applied = new Set(
    db
      .prepare("SELECT id FROM migrations")
      .all()
      .map((r) => String(r.id)),
  );
  for (const m of list) {
    if (applied.has(m.id)) continue;
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)").run(
        m.id,
        new Date().toISOString(),
      );
    });
  }
}

/** Synchronous by design: node:sqlite is sync, so nothing can interleave inside `fn`. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const cache = new WeakMap<Db, Map<string, StatementSync>>();

function stmt(db: Db, sql: string): StatementSync {
  let byDb = cache.get(db);
  if (!byDb) {
    byDb = new Map();
    cache.set(db, byDb);
  }
  let s = byDb.get(sql);
  if (!s) {
    s = db.prepare(sql);
    byDb.set(sql, s);
  }
  return s;
}

/** Row typing is the caller's contract with its own SQL. */
export function queryOne<T>(db: Db, sql: string, ...params: Param[]): T | undefined {
  return stmt(db, sql).get(...params) as T | undefined;
}

export function queryAll<T>(db: Db, sql: string, ...params: Param[]): T[] {
  return stmt(db, sql).all(...params) as T[];
}

export function execute(db: Db, sql: string, ...params: Param[]): number {
  return Number(stmt(db, sql).run(...params).changes);
}
