import { loadConfig } from "./config/index.ts";
import { createLogger } from "./lib/logger.ts";
import { startRuntime } from "./runtime.ts";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const logger = createLogger(config.logLevel, { service: "emdia-api" });
const { app, db } = await startRuntime(config, logger);

const server = app.listen(config.port, () => {
  logger.info("listening", { port: config.port, env: config.env, version: config.version });
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error(
      `port ${config.port} is already in use: another API is probably running (stop it, or set PORT)`,
      { port: config.port },
    );
  } else {
    logger.error("server failed to start", { error: err.message });
  }
  process.exit(1);
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
    void db.close().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => logger.error("unhandled rejection", { err: reason }));
