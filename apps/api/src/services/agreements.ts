import type { Agreement, CreateAgreementInput } from "@emdia/shared";
import { AppError, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import { loadContract, loadWritableContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

/** Something the worker pays back in work; installments are compensation payments. */
export function agreementsService(deps: ServiceDeps) {
  const { repos } = deps;

  function find(contractId: string, agreementId: string): Agreement {
    const agreement = repos.agreements.find(contractId, agreementId);
    if (!agreement) throw notFound("Acordo não encontrado");
    return agreement;
  }

  function record(actor: Actor, agreement: Agreement, action: string) {
    audit(deps, {
      actorId: actor.id,
      contractId: agreement.contractId,
      action,
      entity: "agreement",
      entityId: agreement.id,
      meta: { description: agreement.description, totalCents: agreement.totalCents },
    });
  }

  return {
    list(actor: Actor, contractId: string): Agreement[] {
      loadContract(deps, actor, contractId);
      return repos.agreements.list(contractId);
    },

    create(actor: Actor, contractId: string, input: CreateAgreementInput): Agreement {
      loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "agreement:write");
      const agreement: Agreement = {
        id: newId(),
        contractId,
        description: input.description,
        totalCents: input.totalCents,
        installmentCents: input.installmentCents,
        startMonth: input.startMonth,
        settledCents: 0,
        remainingCents: input.totalCents,
        acceptedAt: null,
        cancelledAt: null,
        createdBy: actor.id,
        createdAt: nowIso(deps),
      };
      repos.tx(() => {
        repos.agreements.insert(agreement);
        record(actor, agreement, "agreement.create");
      });
      return agreement;
    },

    accept(actor: Actor, contractId: string, agreementId: string): Agreement {
      loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "agreement:accept");
      const agreement = find(contractId, agreementId);
      if (agreement.cancelledAt) throw new AppError("CONFLICT", "Este acordo foi cancelado");
      if (agreement.acceptedAt) return agreement;
      repos.tx(() => {
        repos.agreements.accept(agreementId, nowIso(deps));
        record(actor, agreement, "agreement.accept");
      });
      return find(contractId, agreementId);
    },

    /** Installments already paid stay; only future ones are blocked. */
    cancel(actor: Actor, contractId: string, agreementId: string): Agreement {
      loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "agreement:write");
      const agreement = find(contractId, agreementId);
      if (agreement.cancelledAt) return agreement;
      repos.tx(() => {
        repos.agreements.cancel(agreementId, nowIso(deps));
        record(actor, agreement, "agreement.cancel");
      });
      return find(contractId, agreementId);
    },
  };
}
