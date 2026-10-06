import cookieParser from "cookie-parser";
import express, { Router, type Express } from "express";
import type { Config } from "../config/index.ts";
import type { Logger } from "../lib/logger.ts";
import type { Services } from "../services/index.ts";
import { authenticate } from "./middleware/auth.ts";
import { cors } from "./middleware/cors.ts";
import { errorHandler, notFoundHandler } from "./middleware/errors.ts";
import { createRateLimiter } from "./middleware/rate-limit.ts";
import { requestContext } from "./middleware/request-context.ts";
import { createSecurityHeaders } from "./middleware/security-headers.ts";
import { adjustmentRoutes } from "./routes/adjustments.ts";
import { authRoutes } from "./routes/auth.ts";
import { contractRoutes } from "./routes/contracts.ts";
import { entryRoutes } from "./routes/entries.ts";
import { householdRoutes } from "./routes/households.ts";
import { meRoutes } from "./routes/me.ts";
import { paymentRoutes } from "./routes/payments.ts";
import { reportRoutes } from "./routes/reports.ts";
import { webRoutes } from "./web.ts";

export interface AppDeps {
  config: Config;
  logger: Logger;
  services: Services;
}

export function createApp({ config, logger, services }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.set("query parser", "simple");

  app.use(requestContext(logger));
  app.use(
    createSecurityHeaders({ isProduction: config.isProduction, servesWeb: !!config.webDistDir }),
  );

  const api = Router();
  api.use(cors(config.webOrigin));
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  api.use(createRateLimiter(config.rateLimit.global));
  api.use(express.json({ limit: "100kb" }));
  api.use(cookieParser());
  app.use("/api", api);

  api.get("/health", (_req, res) => {
    const dbOk = services.health.databaseOk();
    res
      .status(dbOk ? 200 : 503)
      .json({ status: dbOk ? "ok" : "error", db: dbOk ? "ok" : "error", version: config.version });
  });

  const v1 = Router();
  v1.use(authRoutes(services, config, createRateLimiter(config.rateLimit.auth)));
  if (!config.isProduction) {
    v1.get("/dev/outbox", (_req, res) => {
      res.json({ messages: services.outbox() });
    });
  }
  v1.use(authenticate(services));
  v1.use(meRoutes(services));
  v1.use(householdRoutes(services));
  v1.use(contractRoutes(services));
  v1.use(entryRoutes(services));
  v1.use(adjustmentRoutes(services));
  v1.use(paymentRoutes(services));
  v1.use(reportRoutes(services));
  api.use("/v1", v1);
  if (config.webDistDir) app.use(webRoutes(config.webDistDir));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
