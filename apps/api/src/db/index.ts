import type { Database } from "./database.ts";
import type { PostgresOptions } from "./postgres.ts";

export type { Database, Executor } from "./database.ts";
export { pendingMigrations } from "./migrations.ts";

export type DatabaseTarget =
  | { kind: "pglite"; dir: string | null }
  | { kind: "postgres"; url: string };

export const DEFAULT_PGLITE_DIR = "./data/pglite";

/**
 * DATABASE_URL: `postgres(ql)://…` (Neon, Docker, self-hosted) uses node-postgres;
 * unset, `pglite:<dir>` or `pglite:memory` uses embedded PGlite.
 */
export function parseDatabaseUrl(url: string | undefined): DatabaseTarget {
  if (!url) return { kind: "pglite", dir: DEFAULT_PGLITE_DIR };
  if (/^postgres(ql)?:\/\//.test(url)) return { kind: "postgres", url };
  if (url.startsWith("pglite:")) {
    const dir = url.slice("pglite:".length);
    return { kind: "pglite", dir: dir === "memory" || dir === "" ? null : dir };
  }
  throw new Error(
    `DATABASE_URL must be postgres://…, postgresql://… or pglite:<dir>, got ${url.split(":")[0]}:…`,
  );
}

/** Drivers load lazily so a deployment only pulls in the one it uses (PGlite ships a WASM build). */
export async function openDatabase(
  url: string | undefined,
  options: PostgresOptions = {},
): Promise<Database> {
  const target = parseDatabaseUrl(url);
  if (target.kind === "postgres") {
    const { createPostgresDatabase } = await import("./postgres.ts");
    return createPostgresDatabase(target.url, options);
  }
  const { createPgliteDatabase } = await import("./pglite.ts");
  return createPgliteDatabase(target.dir);
}

export type { PostgresOptions };
