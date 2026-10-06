import { randomCode, sha256 } from "../lib/crypto.ts";
import { notFound } from "../lib/errors.ts";
import type { LocatedContract } from "../repos/index.ts";
import { audit, nowIso, type ServiceDeps } from "./context.ts";

export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 8;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashInviteCode = (code: string) => sha256(code.toUpperCase());

export function newInviteCode(): string {
  return randomCode(INVITE_ALPHABET, INVITE_LENGTH);
}

/** The contract a code points to, if the code is live and the contract can still be joined. */
export function resolveInvite(deps: ServiceDeps, code: string): LocatedContract | undefined {
  const contractId = deps.repos.invites.findContractId(hashInviteCode(code), nowIso(deps));
  const located = contractId ? deps.repos.contracts.findById(contractId) : undefined;
  if (!located || located.contract.workerId !== null || located.contract.status !== "active")
    return undefined;
  return located;
}

/** Must run inside the caller's transaction. Codes are single use. */
export function linkWorkerByCode(deps: ServiceDeps, workerId: string, code: string): string {
  const located = resolveInvite(deps, code);
  if (!located) throw notFound("Código de convite inválido ou expirado");
  const contractId = located.contract.id;
  deps.repos.contracts.linkWorker(contractId, workerId);
  deps.repos.invites.deleteForContract(contractId);
  audit(deps, {
    actorId: workerId,
    contractId,
    action: "contract.join",
    entity: "contract",
    entityId: contractId,
  });
  return contractId;
}
