import type {
  Contract,
  CreateContractInput,
  InviteDelivery,
  IsoDate,
  UpdateContractInput,
} from "@emdia/shared";
import { fieldError, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import type { LocatedContract } from "../repos/index.ts";
import { listContracts, loadContract, loadWritableContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";
import { issueInvite, linkWorkerByCode } from "./invites.ts";

export function contractsService(deps: ServiceDeps) {
  const { repos } = deps;
  const reloadLocated = (id: string): LocatedContract => {
    const located = repos.contracts.findById(id);
    if (!located) throw notFound("Vínculo não encontrado");
    return located;
  };
  const reload = (id: string): Contract => reloadLocated(id).contract;
  const record = (
    actor: Actor,
    contractId: string,
    action: string,
    meta?: Record<string, unknown>,
  ) =>
    audit(deps, {
      actorId: actor.id,
      contractId,
      action,
      entity: "contract",
      entityId: contractId,
      meta,
    });

  return {
    list(actor: Actor, includeArchived: boolean): Contract[] {
      requirePermission(actor, "contract:read");
      return listContracts(deps, actor, includeArchived).map((l) => l.contract);
    },

    get(actor: Actor, id: string): Contract {
      requirePermission(actor, "contract:read");
      return loadContract(deps, actor, id).contract;
    },

    /** With a contact e-mail or phone the invite goes out right away, so the worker can join. */
    async create(
      actor: Actor,
      input: CreateContractInput,
    ): Promise<{ contract: Contract; invite: InviteDelivery | null }> {
      requirePermission(actor, "contract:create");
      const household = input.householdId
        ? repos.households.findById(input.householdId)
        : repos.households.listByOwner(actor.id)[0];
      if (!household || household.ownerId !== actor.id)
        throw fieldError("householdId", "Casa não encontrada");

      const id = newId();
      const contactEmail = input.contactEmail ?? null;
      const contactPhone = input.contactPhone ?? null;
      repos.tx(() => {
        repos.contracts.insert({
          id,
          householdId: household.id,
          createdAt: nowIso(deps),
          workerName: input.workerName,
          occupation: input.occupation,
          payType: input.payType,
          rateCents: input.rateCents,
          schedule: input.schedule,
          deductAbsences: input.deductAbsences,
          contactEmail,
          contactPhone,
          expectedStart: input.expectedStart,
          expectedEnd: input.expectedEnd,
          startedOn: input.startedOn,
        });
        record(actor, id, "contract.create");
      });

      const located = reloadLocated(id);
      const invite = contactEmail || contactPhone ? await issueInvite(deps, actor, located) : null;
      return { contract: located.contract, invite };
    },

    update(actor: Actor, id: string, input: UpdateContractInput): Contract {
      const { contract } = loadWritableContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      const next = {
        workerName: input.workerName ?? contract.workerName,
        occupation: input.occupation ?? contract.occupation,
        payType: input.payType ?? contract.payType,
        rateCents: input.rateCents ?? contract.rateCents,
        schedule: input.schedule ?? contract.schedule,
        deductAbsences: input.deductAbsences ?? contract.deductAbsences,
        contactEmail: input.contactEmail === undefined ? contract.contactEmail : input.contactEmail,
        contactPhone: input.contactPhone === undefined ? contract.contactPhone : input.contactPhone,
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
        record(actor, id, "contract.update", { fields: Object.keys(input) });
      });
      return reload(id);
    },

    end(actor: Actor, id: string, endedOn: IsoDate): Contract {
      const { contract } = loadWritableContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      if (endedOn < contract.startedOn)
        throw fieldError("endedOn", "O encerramento não pode ser antes do início");
      repos.tx(() => {
        repos.contracts.end(id, endedOn);
        repos.invites.deleteForContract(id);
        record(actor, id, "contract.end", { endedOn });
      });
      return reload(id);
    },

    /** Logical removal: history stays readable, writes stop, a pending invite dies. */
    archive(actor: Actor, id: string): void {
      const { contract } = loadContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      if (contract.archivedAt) return;
      repos.tx(() => {
        repos.contracts.setArchivedAt(id, nowIso(deps));
        repos.invites.deleteForContract(id);
        record(actor, id, "contract.archive");
      });
    },

    restore(actor: Actor, id: string): Contract {
      const { contract } = loadContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      if (!contract.archivedAt) return contract;
      repos.tx(() => {
        repos.contracts.setArchivedAt(id, null);
        record(actor, id, "contract.restore");
      });
      return reload(id);
    },

    async invite(actor: Actor, id: string): Promise<InviteDelivery> {
      const located = loadContract(deps, actor, id);
      requirePermission(actor, "contract:invite");
      return issueInvite(deps, actor, located);
    },

    join(actor: Actor, code: string): Contract {
      requirePermission(actor, "contract:join");
      return reload(repos.tx(() => linkWorkerByCode(deps, actor.id, code)));
    },
  };
}
