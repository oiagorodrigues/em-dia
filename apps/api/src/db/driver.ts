/** SQL parameters both drivers accept. */
export type Param = string | number | bigint | null;

/** Row typing is the caller's contract with its own SQL. */
export interface Executor {
  get<T>(sql: string, ...params: Param[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: Param[]): Promise<T[]>;
  /** Returns the number of rows changed. */
  run(sql: string, ...params: Param[]): Promise<number>;
  /** Runs a script of `;`-separated statements (migrations). */
  exec(script: string): Promise<void>;
}

export interface Database extends Executor {
  readonly driver: "node-sqlite" | "libsql";
  /**
   * Runs `fn` in a write transaction: committed when it resolves, rolled back
   * when it throws. Inside `fn` use only `tx`; calling the database itself
   * from there would wait for the transaction to finish.
   */
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
