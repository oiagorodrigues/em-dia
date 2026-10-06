import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Database, Executor, Param } from "./driver.ts";

/**
 * One synchronous connection. Statements never interleave on their own, but an
 * async transaction yields between statements, so everything else waits on
 * `lock` until it commits or rolls back.
 */
export function createNodeSqliteDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string) => {
    let s = statements.get(sql);
    if (!s) {
      s = db.prepare(sql);
      statements.set(sql, s);
    }
    return s;
  };

  const direct: Executor = {
    get: async <T>(sql: string, ...params: Param[]) => prepare(sql).get(...params) as T | undefined,
    all: async <T>(sql: string, ...params: Param[]) => prepare(sql).all(...params) as T[],
    run: async (sql, ...params) => Number(prepare(sql).run(...params).changes),
    exec: async (script) => db.exec(script),
  };

  let lock: Promise<unknown> = Promise.resolve();
  const afterLock = <T>(op: () => Promise<T>): Promise<T> => lock.then(op);

  return {
    driver: "node-sqlite",
    get: (sql, ...params) => afterLock(() => direct.get(sql, ...params)),
    all: (sql, ...params) => afterLock(() => direct.all(sql, ...params)),
    run: (sql, ...params) => afterLock(() => direct.run(sql, ...params)),
    exec: (script) => afterLock(() => direct.exec(script)),

    transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
      const result = lock.then(async () => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const value = await fn(direct);
          db.exec("COMMIT");
          return value;
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      });
      lock = result.catch(() => undefined);
      return result;
    },

    async close() {
      await lock;
      db.close();
    },
  };
}
