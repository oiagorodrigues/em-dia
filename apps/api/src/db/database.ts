import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema.ts";

/** A Drizzle database or an open transaction on it; repos accept either. */
export type Executor = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  readonly driver: "pglite" | "node-postgres";
  readonly db: Executor;
  /** Committed when `fn` resolves, rolled back when it throws. Use only `tx` inside. */
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  /**
   * Applies pending migrations from `drizzle/` and returns the tags this call applied
   * (decided under the lock, so a run that waited on another reports none).
   */
  migrate(): Promise<string[]>;
  close(): Promise<void>;
}
