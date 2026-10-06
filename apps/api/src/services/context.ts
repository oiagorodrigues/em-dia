import type { Permission, PublicUser } from "@emdia/shared";
import { can } from "@emdia/shared";
import type { Config } from "../config/index.ts";
import { forbidden } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import type { AccessTokens } from "../lib/jwt.ts";
import type { Logger } from "../lib/logger.ts";
import type { Mailer } from "../lib/mailer.ts";
import type { FileStore } from "../lib/storage.ts";
import type { AuditEvent, Repos, TxRepos } from "../repos/index.ts";

export interface ServiceDeps {
  repos: Repos;
  config: Config;
  mailer: Mailer;
  files: FileStore;
  logger: Logger;
  tokens: AccessTokens;
  clock: () => Date;
}

/** The authenticated caller, always loaded fresh from the DB. */
export type Actor = PublicUser;

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) throw forbidden();
}

export function nowIso(deps: ServiceDeps): string {
  return deps.clock().toISOString();
}

/** Pass the transaction's repositories when the event belongs to a write in progress. */
export function audit(
  deps: ServiceDeps,
  event: Omit<AuditEvent, "id" | "at" | "meta"> & { meta?: AuditEvent["meta"] },
  r: TxRepos = deps.repos,
): Promise<void> {
  return r.audit.insert({ ...event, meta: event.meta ?? null, id: newId(), at: nowIso(deps) });
}
