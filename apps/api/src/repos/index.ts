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
import { sql } from "drizzle-orm";

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

export function createRepos(database: Database) {
  return {
    ...bind(database.db),
    /** Repositories used inside `fn` share one atomic transaction. */
    tx: <T>(fn: (r: TxRepos) => Promise<T>): Promise<T> =>
      database.transaction((tx) => fn(bind(tx))),
    ping: async (): Promise<boolean> => {
      await database.db.execute(sql`SELECT 1`);
      return true;
    },
  };
}

export type Repos = ReturnType<typeof createRepos>;

export { isDuplicateEmail, toPublicUser, type UserRecord } from "./users.ts";
export { toPayment, type PaymentRecord } from "./payments.ts";
export type { LocatedContract, ContractFields } from "./contracts.ts";
export type { AuditEvent } from "./audit.ts";
export type { RefreshTokenRecord } from "./refresh-tokens.ts";
export type { Database } from "../db/index.ts";
