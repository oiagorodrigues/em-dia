import type { Config } from "../config/index.ts";
import { createAccessTokens } from "../lib/jwt.ts";
import type { Logger } from "../lib/logger.ts";
import type { Mailer } from "../lib/mailer.ts";
import { createBlobStore } from "../lib/blob-store.ts";
import { createFileStore, type FileStore } from "../lib/storage.ts";
import { createRepos, type Database } from "../repos/index.ts";
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
  db: Database;
  config: Config;
  logger: Logger;
  mailer: Mailer;
  /** Injected so tests can move time (token expiry, lockout, "today"). */
  clock?: () => Date;
  /** Defaults to the store the config selects (Vercel Blob or the upload dir). */
  files?: FileStore;
}

export function createReceiptStore(config: Config): FileStore {
  return config.blob ? createBlobStore(config.blob) : createFileStore(config.uploadDir);
}

export function createServices({
  db,
  config,
  logger,
  mailer,
  clock = () => new Date(),
  files = createReceiptStore(config),
}: ServiceOptions) {
  const deps: ServiceDeps = {
    repos: createRepos(db),
    config,
    logger,
    mailer,
    clock,
    files,
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
    health: {
      databaseOk: () =>
        deps.repos.ping().catch((err: unknown) => {
          logger.error("database health check failed", { err });
          return false;
        }),
    },
    outbox: () => deps.mailer.outbox(),
  };
}

export type Services = ReturnType<typeof createServices>;
export type { Actor } from "./context.ts";
export type { Session } from "./auth.ts";
export type { UploadedFile } from "./payments.ts";
