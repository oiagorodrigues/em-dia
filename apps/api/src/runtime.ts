import type { Express } from "express";
import type { Config } from "./config/index.ts";
import { migrate, openDatabase, pendingMigrations, type Database } from "./db/index.ts";
import { createApp } from "./http/app.ts";
import type { Logger } from "./lib/logger.ts";
import { createMailer } from "./lib/mailer.ts";
import { createServices } from "./services/index.ts";

export interface Runtime {
  app: Express;
  db: Database;
}

/**
 * Wires the app for both entries (long-running server and Vercel Function).
 * A local SQLite file migrates itself; a remote database is migrated by the
 * build (`db:migrate`), never by a function instance racing other instances.
 */
export async function startRuntime(config: Config, logger: Logger): Promise<Runtime> {
  if (config.jwtSecretEphemeral) {
    logger.warn("JWT_SECRET not set: using a random key, sessions will not survive a restart");
  }
  if (config.isProduction && !config.smtpUrl) {
    logger.warn("SMTP_URL not set: e-mails (invites, password resets) will not be sent");
  }
  if (config.onVercel && !config.upstash) {
    logger.warn("UPSTASH_REDIS_REST_URL not set: rate limits are counted per function instance");
  }

  const db = openDatabase(config.databaseUrl, config.databaseAuthToken ?? undefined);
  if (db.driver === "node-sqlite") {
    await migrate(db);
  } else {
    const pending = await pendingMigrations(db);
    if (pending.length > 0) {
      logger.error("database schema is behind: run `bun run db:migrate`", { pending });
    }
  }

  const mailer = createMailer(
    { isProduction: config.isProduction, smtpUrl: config.smtpUrl, from: config.mailFrom },
    logger,
  );
  const services = createServices({ db, config, logger, mailer });
  logger.info("runtime ready", {
    database: db.driver,
    receipts: config.blob ? "vercel-blob" : "filesystem",
  });
  return { app: createApp({ config, logger, services }), db };
}
