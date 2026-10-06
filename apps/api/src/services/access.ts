import type { Contract } from "@emdia/shared";
import { AppError, notFound } from "../lib/errors.ts";
import type { LocatedContract } from "../repos/index.ts";
import type { Actor, ServiceDeps } from "./context.ts";

/** 404 for contracts the actor is not a party to, so their existence is not leaked. */
export function loadContract(deps: ServiceDeps, actor: Actor, contractId: string): LocatedContract {
  const located = deps.repos.contracts.findById(contractId);
  if (!located) throw notFound("Vínculo não encontrado");
  const { contract } = located;
  const isParty =
    actor.role === "employer" ? contract.employerId === actor.id : contract.workerId === actor.id;
  if (!isParty) throw notFound("Vínculo não encontrado");
  return located;
}

/** Archived (removed) contracts keep their history readable but accept no writes. */
export function assertNotArchived(contract: Contract): void {
  if (contract.archivedAt) throw new AppError("CONFLICT", "Este vínculo foi removido");
}

/** Loads a contract the actor is a party to and that still accepts writes. */
export function loadWritableContract(
  deps: ServiceDeps,
  actor: Actor,
  contractId: string,
): LocatedContract {
  const located = loadContract(deps, actor, contractId);
  assertNotArchived(located.contract);
  return located;
}

export function listContracts(
  deps: ServiceDeps,
  actor: Actor,
  includeArchived = false,
): LocatedContract[] {
  return actor.role === "employer"
    ? deps.repos.contracts.listForEmployer(actor.id, includeArchived)
    : deps.repos.contracts.listForWorker(actor.id, includeArchived);
}
