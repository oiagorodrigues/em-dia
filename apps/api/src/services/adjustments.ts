import type { Adjustment, CreateAdjustmentInput, YearMonth } from "@emdia/shared";
import { notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import { loadContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

export function adjustmentsService(deps: ServiceDeps) {
  const { repos } = deps;
  return {
    list(actor: Actor, contractId: string, month: YearMonth): Adjustment[] {
      loadContract(deps, actor, contractId);
      return repos.adjustments.listByMonth(contractId, month);
    },

    create(actor: Actor, contractId: string, input: CreateAdjustmentInput): Adjustment {
      loadContract(deps, actor, contractId);
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
      repos.tx(() => {
        repos.adjustments.insert(adjustment);
        audit(deps, {
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
        });
      });
      return adjustment;
    },

    remove(actor: Actor, contractId: string, adjustmentId: string): void {
      loadContract(deps, actor, contractId);
      requirePermission(actor, "adjustment:write");
      const adjustment = repos.adjustments.find(contractId, adjustmentId);
      if (!adjustment) throw notFound("Lançamento não encontrado");
      repos.tx(() => {
        repos.adjustments.delete(adjustmentId);
        audit(deps, {
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
        });
      });
    },
  };
}
