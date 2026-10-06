import type { Contract, CreateContractInput, IsoDate, UpdateContractInput } from "@ponto/shared";
import { AppError, fieldError, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import { listContracts, loadContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";
import { hashInviteCode, INVITE_TTL_MS, linkWorkerByCode, newInviteCode } from "./invites.ts";

const uniqueDays = (days: number[]) => [...new Set(days)].sort((a, b) => a - b);

export function contractsService(deps: ServiceDeps) {
  const { repos } = deps;
  const reload = (id: string): Contract => {
    const located = repos.contracts.findById(id);
    if (!located) throw notFound("Vínculo não encontrado");
    return located.contract;
  };

  return {
    list(actor: Actor): Contract[] {
      requirePermission(actor, "contract:read");
      return listContracts(deps, actor).map((l) => l.contract);
    },

    get(actor: Actor, id: string): Contract {
      requirePermission(actor, "contract:read");
      return loadContract(deps, actor, id).contract;
    },

    create(actor: Actor, input: CreateContractInput): Contract {
      requirePermission(actor, "contract:create");
      const household = input.householdId
        ? repos.households.findById(input.householdId)
        : repos.households.listByOwner(actor.id)[0];
      if (!household || household.ownerId !== actor.id)
        throw fieldError("householdId", "Casa não encontrada");

      const id = newId();
      repos.tx(() => {
        repos.contracts.insert({
          id,
          householdId: household.id,
          createdAt: nowIso(deps),
          workerName: input.workerName,
          occupation: input.occupation,
          payType: input.payType,
          rateCents: input.rateCents,
          scheduleDays: uniqueDays(input.scheduleDays),
          expectedStart: input.expectedStart,
          expectedEnd: input.expectedEnd,
          startedOn: input.startedOn,
        });
        audit(deps, {
          actorId: actor.id,
          contractId: id,
          action: "contract.create",
          entity: "contract",
          entityId: id,
        });
      });
      return reload(id);
    },

    update(actor: Actor, id: string, input: UpdateContractInput): Contract {
      const { contract } = loadContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      const next = {
        workerName: input.workerName ?? contract.workerName,
        occupation: input.occupation ?? contract.occupation,
        payType: input.payType ?? contract.payType,
        rateCents: input.rateCents ?? contract.rateCents,
        scheduleDays: uniqueDays(input.scheduleDays ?? contract.scheduleDays),
        expectedStart:
          input.expectedStart === undefined ? contract.expectedStart : input.expectedStart,
        expectedEnd: input.expectedEnd === undefined ? contract.expectedEnd : input.expectedEnd,
        startedOn: input.startedOn ?? contract.startedOn,
      };
      if (contract.endedOn && next.startedOn > contract.endedOn) {
        throw fieldError("startedOn", "O início não pode ser depois do encerramento");
      }
      repos.tx(() => {
        repos.contracts.update(id, next);
        audit(deps, {
          actorId: actor.id,
          contractId: id,
          action: "contract.update",
          entity: "contract",
          entityId: id,
          meta: { fields: Object.keys(input) },
        });
      });
      return reload(id);
    },

    end(actor: Actor, id: string, endedOn: IsoDate): Contract {
      const { contract } = loadContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      if (endedOn < contract.startedOn)
        throw fieldError("endedOn", "O encerramento não pode ser antes do início");
      repos.tx(() => {
        repos.contracts.end(id, endedOn);
        repos.invites.deleteForContract(id);
        audit(deps, {
          actorId: actor.id,
          contractId: id,
          action: "contract.end",
          entity: "contract",
          entityId: id,
          meta: { endedOn },
        });
      });
      return reload(id);
    },

    invite(actor: Actor, id: string): { code: string; expiresAt: string } {
      const { contract } = loadContract(deps, actor, id);
      requirePermission(actor, "contract:invite");
      if (contract.workerId)
        throw new AppError("CONFLICT", "Este vínculo já tem uma profissional conectada");
      if (contract.status === "ended")
        throw new AppError("CONFLICT", "Este vínculo está encerrado");

      const code = newInviteCode();
      const expiresAt = new Date(deps.clock().getTime() + INVITE_TTL_MS).toISOString();
      repos.tx(() => {
        repos.invites.upsert(id, hashInviteCode(code), expiresAt, nowIso(deps));
        audit(deps, {
          actorId: actor.id,
          contractId: id,
          action: "contract.invite",
          entity: "contract",
          entityId: id,
        });
      });
      return { code, expiresAt };
    },

    join(actor: Actor, code: string): Contract {
      requirePermission(actor, "contract:join");
      return reload(repos.tx(() => linkWorkerByCode(deps, actor.id, code)));
    },
  };
}
