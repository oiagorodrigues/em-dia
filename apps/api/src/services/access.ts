import { notFound } from "../lib/errors.ts";
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

export function listContracts(deps: ServiceDeps, actor: Actor): LocatedContract[] {
  return actor.role === "employer"
    ? deps.repos.contracts.listForEmployer(actor.id)
    : deps.repos.contracts.listForWorker(actor.id);
}
