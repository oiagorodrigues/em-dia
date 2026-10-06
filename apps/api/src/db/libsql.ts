import type { Client, ResultSet, Transaction } from "@libsql/client";
import type { Database, Executor, Param } from "./driver.ts";

/**
 * The Node entry of @libsql/client loads a native SQLite binding on import,
 * which Vercel's file tracing does not pick up. Remote URLs only need the
 * fetch-based web client, so the native one is loaded for local files alone.
 */
async function connect(url: string, authToken: string | undefined): Promise<Client> {
  const { createClient } = url.startsWith("file:")
    ? await import("@libsql/client")
    : await import("@libsql/client/web");
  return createClient({ url, authToken, intMode: "number" });
}

function toObjects<T>(rs: ResultSet): T[] {
  return rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]])) as T);
}

function executor(target: Client | Transaction): Executor {
  return {
    get: async <T>(sql: string, ...args: Param[]) =>
      toObjects<T>(await target.execute({ sql, args }))[0],
    all: async <T>(sql: string, ...args: Param[]) =>
      toObjects<T>(await target.execute({ sql, args })),
    run: async (sql, ...args) => (await target.execute({ sql, args })).rowsAffected,
    exec: (script) => target.executeMultiple(script),
  };
}

function lazyExecutor(client: Promise<Client>): Executor {
  return {
    get: async (sql, ...args) => executor(await client).get(sql, ...args),
    all: async (sql, ...args) => executor(await client).all(sql, ...args),
    run: async (sql, ...args) => executor(await client).run(sql, ...args),
    exec: async (script) => executor(await client).exec(script),
  };
}

const BUSY_RETRIES = 6;
const BUSY_BACKOFF_MS = 40;

const isBusy = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "SQLITE_BUSY";

/**
 * Another instance holding the write lock surfaces as SQLITE_BUSY. A busy
 * transaction was rolled back and our transaction bodies have no side effects
 * outside the database, so the whole transaction is retried with backoff.
 */
export async function retryWhileBusy<T>(
  run: () => Promise<T>,
  { retries = BUSY_RETRIES, backoffMs = BUSY_BACKOFF_MS } = {},
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run();
    } catch (err) {
      if (!isBusy(err) || i >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** i * (1 + Math.random())));
    }
  }
}

/**
 * Turso / libSQL. `url` is `libsql://…` (remote) or `file:…`/`:memory:` (local,
 * used by the driver tests). Transactions are interactive write transactions.
 */
export function createLibsqlDatabase(url: string, authToken?: string): Database {
  // No native busy timeout: on local files it blocks the event loop while it waits, so the
  // transaction holding the lock could never commit. BUSY is retried asynchronously below.
  // Local files (tests, scripts) get WAL, as node:sqlite does; Turso manages its own.
  const client = connect(url, authToken).then(async (c) => {
    if (url.startsWith("file:")) await c.execute("PRAGMA journal_mode = WAL");
    return c;
  });
  const direct = lazyExecutor(client);

  async function attempt<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
    const tx = await (await client).transaction("write");
    try {
      const value = await fn(executor(tx));
      await tx.commit();
      return value;
    } catch (err) {
      if (!tx.closed) await tx.rollback();
      throw err;
    } finally {
      tx.close();
    }
  }

  // Write transactions in one instance queue behind each other (Fluid compute
  // runs concurrent requests in the same process).
  let lock: Promise<unknown> = Promise.resolve();

  return {
    driver: "libsql",
    ...direct,

    transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
      const result = lock.then(() => retryWhileBusy(() => attempt(fn)));
      lock = result.catch(() => undefined);
      return result;
    },

    async close() {
      (await client).close();
    },
  };
}
