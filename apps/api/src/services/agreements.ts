import type { Agreement, CreateAgreementInput } from "@emdia/shared";
import { AppError, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import type { TxRepos } from "../repos/index.ts";
import { loadContract, loadWritableContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

/** Something the worker pays back in work; installments are compensation payments. */
export function agreementsService(deps: ServiceDeps) {
  const { repos } = deps;

  async function find(contractId: string, agreementId: string): Promise<Agreement> {
    const agreement = await repos.agreements.find(contractId, agreementId);
    if (!agreement) throw notFound("Acordo não encontrado");
    return agreement;
  }

  function record(r: TxRepos, actor: Actor, agreement: Agreement, action: string) {
    return audit(
      deps,
      {
        actorId: actor.id,
        contractId: agreement.contractId,
        action,
        entity: "agreement",
        entityId: agreement.id,
        meta: { description: agreement.description, totalCents: agreement.totalCents },
      },
      r,
    );
  }

  return {
    async list(actor: Actor, contractId: string): Promise<Agreement[]> {
      await loadContract(deps, actor, contractId);
      return repos.agreements.list(contractId);
    },

    async create(
      actor: Actor,
      contractId: string,
      input: CreateAgreementInput,
    ): Promise<Agreement> {
      await loadWritableContract(deps, actor, contractId);
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
      await repos.tx(async (r) => {
        await r.agreements.insert(agreement);
        await record(r, actor, agreement, "agreement.create");
      });
      return agreement;
    },

    async accept(actor: Actor, contractId: string, agreementId: string): Promise<Agreement> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "agreement:accept");
      const agreement = await find(contractId, agreementId);
      if (agreement.cancelledAt) throw new AppError("CONFLICT", "Este acordo foi cancelado");
      if (agreement.acceptedAt) return agreement;
      await repos.tx(async (r) => {
        await r.agreements.accept(agreementId, nowIso(deps));
        await record(r, actor, agreement, "agreement.accept");
      });
      return find(contractId, agreementId);
    },

    /** Installments already paid stay; only future ones are blocked. */
    async cancel(actor: Actor, contractId: string, agreementId: string): Promise<Agreement> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "agreement:write");
      const agreement = await find(contractId, agreementId);
      if (agreement.cancelledAt) return agreement;
      await repos.tx(async (r) => {
        await r.agreements.cancel(agreementId, nowIso(deps));
        await record(r, actor, agreement, "agreement.cancel");
      });
      return find(contractId, agreementId);
    },
  };
}
