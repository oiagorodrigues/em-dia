import type {
  Contract,
  CreateContractInput,
  InviteDelivery,
  IsoDate,
  UpdateContractInput,
} from "@emdia/shared";
import { fieldError, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import type { LocatedContract, TxRepos } from "../repos/index.ts";
import { listContracts, loadContract, loadWritableContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";
import { issueInvite, linkWorkerByCode } from "./invites.ts";

export function contractsService(deps: ServiceDeps) {
  const { repos } = deps;
  const reloadLocated = async (id: string): Promise<LocatedContract> => {
    const located = await repos.contracts.findById(id);
    if (!located) throw notFound("Vínculo não encontrado");
    return located;
  };
  const reload = async (id: string): Promise<Contract> => (await reloadLocated(id)).contract;
  const record = (
    r: TxRepos,
    actor: Actor,
    contractId: string,
    action: string,
    meta?: Record<string, unknown>,
  ) =>
    audit(
      deps,
      { actorId: actor.id, contractId, action, entity: "contract", entityId: contractId, meta },
      r,
    );

  return {
    async list(actor: Actor, includeArchived: boolean): Promise<Contract[]> {
      requirePermission(actor, "contract:read");
      return (await listContracts(deps, actor, includeArchived)).map((l) => l.contract);
    },

    async get(actor: Actor, id: string): Promise<Contract> {
      requirePermission(actor, "contract:read");
      return (await loadContract(deps, actor, id)).contract;
    },

    /** With a contact e-mail or phone the invite goes out right away, so the worker can join. */
    async create(
      actor: Actor,
      input: CreateContractInput,
    ): Promise<{ contract: Contract; invite: InviteDelivery | null }> {
      requirePermission(actor, "contract:create");
      const household = input.householdId
        ? await repos.households.findById(input.householdId)
        : (await repos.households.listByOwner(actor.id))[0];
      if (!household || household.ownerId !== actor.id)
        throw fieldError("householdId", "Casa não encontrada");

      const id = newId();
      const contactEmail = input.contactEmail ?? null;
      const contactPhone = input.contactPhone ?? null;
      await repos.tx(async (r) => {
        await r.contracts.insert({
          id,
          householdId: household.id,
          createdAt: nowIso(deps),
          workerName: input.workerName,
          occupation: input.occupation,
          payType: input.payType,
          rateCents: input.rateCents,
          schedule: input.schedule,
          deductAbsences: input.deductAbsences,
          nightBonus: input.nightBonus,
          contactEmail,
          contactPhone,
          expectedStart: input.expectedStart,
          expectedEnd: input.expectedEnd,
          startedOn: input.startedOn,
        });
        await record(r, actor, id, "contract.create");
      });

      const located = await reloadLocated(id);
      const invite = contactEmail || contactPhone ? await issueInvite(deps, actor, located) : null;
      return { contract: located.contract, invite };
    },

    async update(actor: Actor, id: string, input: UpdateContractInput): Promise<Contract> {
      const { contract } = await loadWritableContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      const next = {
        workerName: input.workerName ?? contract.workerName,
        occupation: input.occupation ?? contract.occupation,
        payType: input.payType ?? contract.payType,
        rateCents: input.rateCents ?? contract.rateCents,
        schedule: input.schedule ?? contract.schedule,
        deductAbsences: input.deductAbsences ?? contract.deductAbsences,
        nightBonus: input.nightBonus ?? contract.nightBonus,
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
      await repos.tx(async (r) => {
        await r.contracts.update(id, next);
        await record(r, actor, id, "contract.update", { fields: Object.keys(input) });
      });
      return reload(id);
    },

    async end(actor: Actor, id: string, endedOn: IsoDate): Promise<Contract> {
      const { contract } = await loadWritableContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      if (endedOn < contract.startedOn)
        throw fieldError("endedOn", "O encerramento não pode ser antes do início");
      await repos.tx(async (r) => {
        await r.contracts.end(id, endedOn);
        await r.invites.deleteForContract(id);
        await record(r, actor, id, "contract.end", { endedOn });
      });
      return reload(id);
    },

    /** Logical removal: history stays readable, writes stop, a pending invite dies. */
    async archive(actor: Actor, id: string): Promise<void> {
      const { contract } = await loadContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      if (contract.archivedAt) return;
      await repos.tx(async (r) => {
        await r.contracts.setArchivedAt(id, nowIso(deps));
        await r.invites.deleteForContract(id);
        await record(r, actor, id, "contract.archive");
      });
    },

    async restore(actor: Actor, id: string): Promise<Contract> {
      const { contract } = await loadContract(deps, actor, id);
      requirePermission(actor, "contract:update");
      if (!contract.archivedAt) return contract;
      await repos.tx(async (r) => {
        await r.contracts.setArchivedAt(id, null);
        await record(r, actor, id, "contract.restore");
      });
      return reload(id);
    },

    async invite(actor: Actor, id: string): Promise<InviteDelivery> {
      const located = await loadContract(deps, actor, id);
      requirePermission(actor, "contract:invite");
      return issueInvite(deps, actor, located);
    },

    async join(actor: Actor, code: string): Promise<Contract> {
      requirePermission(actor, "contract:join");
      return reload(await repos.tx((r) => linkWorkerByCode(deps, r, actor.id, code)));
    },
  };
}
