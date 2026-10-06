import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import { loadConfig } from "./config/index.ts";
import { createLogger } from "./lib/logger.ts";
import { restoreOriginalUrl } from "./lib/vercel-url.ts";
import { startRuntime } from "./runtime.ts";

const config = loadConfig();
const logger = createLogger(config.logLevel, { service: "emdia-api" });

// One runtime per function instance, built on the first request and reused while the instance lives.
let app: Promise<Express> | undefined;
const ready = () =>
  (app ??= startRuntime(config, logger)
    .then((runtime) => runtime.app)
    .catch((err: unknown) => {
      app = undefined;
      throw err;
    }));

/**
 * Vercel's Node helpers add own `body`, `query` and `cookies` properties. They
 * would shadow Express's parsing (and a lazy `body` getter consumes the stream
 * first), so they are removed when configurable; NODEJS_HELPERS=0 avoids them.
 */
function dropVercelHelpers(req: IncomingMessage): void {
  for (const key of ["body", "query", "cookies"]) {
    if (Object.hasOwn(req, key) && !Reflect.deleteProperty(req, key)) {
      logger.warn("could not remove Vercel request helper: set NODEJS_HELPERS=0", { key });
    }
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  dropVercelHelpers(req);
  req.url = restoreOriginalUrl(req.url ?? "/");
  (await ready())(req, res);
}
