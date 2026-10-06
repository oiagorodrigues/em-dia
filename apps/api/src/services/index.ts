import type { Config } from "../config/index.ts";
import { createAccessTokens } from "../lib/jwt.ts";
import type { Logger } from "../lib/logger.ts";
import type { Mailer } from "../lib/mailer.ts";
import { createFileStore } from "../lib/storage.ts";
import { createRepos, type Db } from "../repos/index.ts";
import { adjustmentsService } from "./adjustments.ts";
import { agreementsService } from "./agreements.ts";
import { authService } from "./auth.ts";
import type { ServiceDeps } from "./context.ts";
import { contractsService } from "./contracts.ts";
import { entriesService } from "./entries.ts";
import { householdsService } from "./households.ts";
import { meService } from "./me.ts";
import { paymentsService } from "./payments.ts";
import { reportsService } from "./reports.ts";

export interface ServiceOptions {
  db: Db;
  config: Config;
  logger: Logger;
  mailer: Mailer;
  /** Injected so tests can move time (token expiry, lockout, "today"). */
  clock?: () => Date;
}

export function createServices({
  db,
  config,
  logger,
  mailer,
  clock = () => new Date(),
}: ServiceOptions) {
  const deps: ServiceDeps = {
    repos: createRepos(db),
    config,
    logger,
    mailer,
    clock,
    files: createFileStore(config.uploadDir),
    tokens: createAccessTokens(config.jwtSecret, clock),
  };
  return {
    auth: authService(deps),
    me: meService(deps),
    households: householdsService(deps),
    contracts: contractsService(deps),
    entries: entriesService(deps),
    adjustments: adjustmentsService(deps),
    payments: paymentsService(deps),
    agreements: agreementsService(deps),
    reports: reportsService(deps),
    health: { databaseOk: () => deps.repos.ping() },
    outbox: () => deps.mailer.outbox(),
  };
}

export type Services = ReturnType<typeof createServices>;
export type { Actor } from "./context.ts";
export type { Session } from "./auth.ts";
export type { UploadedFile } from "./payments.ts";
