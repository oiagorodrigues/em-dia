import type { Adjustment, CreateAdjustmentInput, YearMonth } from "@emdia/shared";
import { notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import { loadContract, loadWritableContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

export function adjustmentsService(deps: ServiceDeps) {
  const { repos } = deps;
  return {
    async list(actor: Actor, contractId: string, month: YearMonth): Promise<Adjustment[]> {
      await loadContract(deps, actor, contractId);
      return repos.adjustments.listByMonth(contractId, month);
    },

    async create(
      actor: Actor,
      contractId: string,
      input: CreateAdjustmentInput,
    ): Promise<Adjustment> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "adjustment:write");
      const adjustment: Adjustment = {
        id: newId(),
        contractId,
        month: input.month,
        kind: input.kind,
        amountCents: input.amountCents,
        description: input.description || null,
        createdBy: actor.id,
        createdAt: nowIso(deps),
      };
      await repos.tx(async (r) => {
        await r.adjustments.insert(adjustment);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: "adjustment.create",
            entity: "adjustment",
            entityId: adjustment.id,
            meta: {
              month: adjustment.month,
              kind: adjustment.kind,
              amountCents: adjustment.amountCents,
            },
          },
          r,
        );
      });
      return adjustment;
    },

    async remove(actor: Actor, contractId: string, adjustmentId: string): Promise<void> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "adjustment:write");
      const adjustment = await repos.adjustments.find(contractId, adjustmentId);
      if (!adjustment) throw notFound("Lançamento não encontrado");
      await repos.tx(async (r) => {
        await r.adjustments.delete(adjustmentId);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: "adjustment.delete",
            entity: "adjustment",
            entityId: adjustmentId,
            meta: {
              month: adjustment.month,
              kind: adjustment.kind,
              amountCents: adjustment.amountCents,
            },
          },
          r,
        );
      });
    },
  };
}
