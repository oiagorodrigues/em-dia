import { loadConfig } from "./config/index.ts";
import { openDatabase } from "./db/index.ts";
import { createApp } from "./http/app.ts";
import { createLogger } from "./lib/logger.ts";
import { createDevMailer, createNullMailer } from "./lib/mailer.ts";
import { createServices } from "./services/index.ts";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const logger = createLogger(config.logLevel, { service: "ponto-api" });
if (config.jwtSecretEphemeral) {
  logger.warn("JWT_SECRET not set: using a random key, sessions will not survive a restart");
}

const db = openDatabase(config.databasePath);
const mailer = config.isProduction ? createNullMailer(logger) : createDevMailer(logger);
const services = createServices({ db, config, logger, mailer });
const app = createApp({ config, logger, services });

const server = app.listen(config.port, () => {
  logger.info("listening", { port: config.port, env: config.env, version: config.version });
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) {
    logger.warn("second signal, forcing exit", { signal });
    process.exit(1);
  }
  shuttingDown = true;
  logger.info("shutting down", { signal });
  const force = setTimeout(() => {
    logger.error("forced exit after shutdown timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => logger.error("unhandled rejection", { err: reason }));
