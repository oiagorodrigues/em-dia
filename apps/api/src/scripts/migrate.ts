import { loadDatabaseConfig } from "../config/index.ts";
import { openDatabase } from "../db/index.ts";
import { createLogger } from "../lib/logger.ts";

/**
 * `bun run db:migrate`: applies pending Drizzle migrations (`drizzle/`) to
 * DATABASE_URL_UNPOOLED or DATABASE_URL. Concurrent runs (two deploys
 * building at once) wait on a Postgres advisory lock. With `--if-configured`
 * it does nothing when no database URL is set, so the Vercel build can always call it.
 */
const logger = createLogger("info", { script: "migrate" });
const { url, explicit } = loadDatabaseConfig();

if (!explicit && process.argv.includes("--if-configured")) {
  logger.info("DATABASE_URL not set, skipping migrations");
} else {
  const db = await openDatabase(url);
  try {
    const applied = await db.migrate();
    logger.info(applied.length ? "migrations applied" : "database already up to date", {
      driver: db.driver,
      applied,
    });
  } finally {
    await db.close();
  }
}
