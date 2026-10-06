import type { Database, Executor } from "../db/index.ts";
import { adjustmentsRepo } from "./adjustments.ts";
import { agreementsRepo } from "./agreements.ts";
import { auditRepo } from "./audit.ts";
import { contractsRepo } from "./contracts.ts";
import { entriesRepo } from "./entries.ts";
import { householdsRepo } from "./households.ts";
import { invitesRepo } from "./invites.ts";
import { passwordResetsRepo } from "./password-resets.ts";
import { paymentsRepo } from "./payments.ts";
import { refreshTokensRepo } from "./refresh-tokens.ts";
import { usersRepo } from "./users.ts";

function bind(db: Executor) {
  return {
    users: usersRepo(db),
    households: householdsRepo(db),
    contracts: contractsRepo(db),
    invites: invitesRepo(db),
    entries: entriesRepo(db),
    adjustments: adjustmentsRepo(db),
    payments: paymentsRepo(db),
    agreements: agreementsRepo(db),
    refreshTokens: refreshTokensRepo(db),
    passwordResets: passwordResetsRepo(db),
    audit: auditRepo(db),
  };
}

/** The same repositories bound to an open transaction. */
export type TxRepos = ReturnType<typeof bind>;

export function createRepos(db: Database) {
  return {
    ...bind(db),
    /** Repositories used inside `fn` share one atomic write transaction. */
    tx: <T>(fn: (r: TxRepos) => Promise<T>): Promise<T> => db.transaction((ex) => fn(bind(ex))),
    ping: async (): Promise<boolean> => (await db.get<{ ok: number }>("SELECT 1 AS ok"))?.ok === 1,
  };
}

export type Repos = ReturnType<typeof createRepos>;

export { toPublicUser, type UserRecord } from "./users.ts";
export { toPayment, type PaymentRecord } from "./payments.ts";
export type { LocatedContract, ContractFields } from "./contracts.ts";
export type { AuditEvent } from "./audit.ts";
export type { RefreshTokenRecord } from "./refresh-tokens.ts";
export type { Database } from "../db/index.ts";
