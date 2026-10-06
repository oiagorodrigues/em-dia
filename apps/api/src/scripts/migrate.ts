import { loadDatabaseConfig } from "../config/index.ts";
import { migrate, openDatabase } from "../db/index.ts";
import { createLogger } from "../lib/logger.ts";

/**
 * `bun run db:migrate`: applies pending migrations to DATABASE_URL (or
 * DATABASE_PATH). Safe to run on every deploy and from concurrent builds.
 * With `--if-configured` it does nothing when no DATABASE_URL is set, so the
 * Vercel build can always call it.
 */
const logger = createLogger("info", { script: "migrate" });
const { url, authToken, explicit } = loadDatabaseConfig();

if (!explicit && process.argv.includes("--if-configured")) {
  logger.info("DATABASE_URL not set, skipping migrations");
} else {
  const db = openDatabase(url, authToken ?? undefined);
  try {
    const applied = await migrate(db);
    logger.info(applied.length ? "migrations applied" : "database already up to date", {
      driver: db.driver,
      applied,
    });
  } finally {
    await db.close();
  }
}
