import { queryOne, transaction, type Db } from "../db/index.ts";
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

export function createRepos(db: Db) {
  return {
    tx: <T>(fn: () => T): T => transaction(db, fn),
    ping: (): boolean => queryOne<{ ok: number }>(db, "SELECT 1 AS ok")?.ok === 1,
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

export type Repos = ReturnType<typeof createRepos>;

export { toPublicUser, type UserRecord } from "./users.ts";
export { toPayment, type PaymentRecord } from "./payments.ts";
export type { LocatedContract, ContractFields } from "./contracts.ts";
export type { AuditEvent } from "./audit.ts";
export type { RefreshTokenRecord } from "./refresh-tokens.ts";
export type { Db } from "../db/index.ts";
