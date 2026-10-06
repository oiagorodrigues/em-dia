import type { EntryStatus, IsoDate, UpsertEntryInput, WorkEntry, YearMonth } from "@emdia/shared";
import { nowInZone, shiftMinutes } from "@emdia/shared";
import { AppError, fieldError, forbidden, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import type { LocatedContract } from "../repos/index.ts";
import { loadContract, loadWritableContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

const FUTURE_ALLOWED = new Set<EntryStatus>(["day_off", "holiday", "excused"]);

type EntryFields = Pick<WorkEntry, "status" | "checkIn" | "checkOut" | "breakMinutes" | "note">;

function computeMinutes(f: EntryFields): number {
  return f.status === "worked" && f.checkIn && f.checkOut
    ? shiftMinutes(f.checkIn, f.checkOut, f.breakMinutes)
    : 0;
}

function assertWithinContract({ contract }: LocatedContract, date: IsoDate): void {
  if (date < contract.startedOn || (contract.endedOn !== null && date > contract.endedOn)) {
    throw fieldError("date", "Data fora do período do vínculo");
  }
}

export function entriesService(deps: ServiceDeps) {
  const { repos } = deps;

  /**
   * Any write makes the writer the entry's author and clears confirmation,
   * so the other party has to confirm the new version.
   */
  function write(
    actor: Actor,
    contractId: string,
    date: IsoDate,
    fields: EntryFields,
    existing?: WorkEntry,
  ) {
    const entry: WorkEntry = {
      id: existing?.id ?? newId(),
      contractId,
      date,
      ...fields,
      minutes: computeMinutes(fields),
      createdBy: actor.id,
      createdByRole: actor.role,
      confirmedBy: null,
      confirmedAt: null,
      updatedAt: nowIso(deps),
    };
    repos.entries.save(entry);
    return entry;
  }

  function findEntry(contractId: string, date: IsoDate): WorkEntry {
    const entry = repos.entries.find(contractId, date);
    if (!entry) throw notFound("Registro não encontrado");
    return entry;
  }

  return {
    list(actor: Actor, contractId: string, month: YearMonth): WorkEntry[] {
      loadContract(deps, actor, contractId);
      return repos.entries.listByMonth(contractId, month);
    },

    upsert(actor: Actor, contractId: string, date: IsoDate, input: UpsertEntryInput) {
      const located = loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "entry:write");
      assertWithinContract(located, date);
      const today = nowInZone(located.timezone, deps.clock()).date;
      if (date > today && !FUTURE_ALLOWED.has(input.status)) {
        throw fieldError("date", "Datas futuras só aceitam folga, feriado ou falta justificada");
      }

      const existing = repos.entries.find(contractId, date);
      const fields: EntryFields = {
        status: input.status,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        breakMinutes: input.breakMinutes,
        note: input.note || null,
      };
      const entry = repos.tx(() => {
        const saved = write(actor, contractId, date, fields, existing);
        audit(deps, {
          actorId: actor.id,
          contractId,
          action: existing ? "entry.update" : "entry.create",
          entity: "entry",
          entityId: saved.id,
          meta: { date, status: saved.status },
        });
        return saved;
      });
      return { entry, created: !existing };
    },

    remove(actor: Actor, contractId: string, date: IsoDate): void {
      loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "entry:write");
      const entry = findEntry(contractId, date);
      if (actor.role !== "employer" && (entry.createdBy !== actor.id || entry.confirmedAt)) {
        throw forbidden("Só quem lançou pode apagar, e apenas antes da confirmação");
      }
      repos.tx(() => {
        repos.entries.delete(contractId, date);
        audit(deps, {
          actorId: actor.id,
          contractId,
          action: "entry.delete",
          entity: "entry",
          entityId: entry.id,
          meta: { date },
        });
      });
    },

    confirm(actor: Actor, contractId: string, date: IsoDate): WorkEntry {
      loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "entry:confirm");
      const entry = findEntry(contractId, date);
      if (entry.createdBy === actor.id) throw forbidden("A confirmação é feita pela outra parte");
      if (entry.confirmedAt) return entry;

      const confirmed = { ...entry, confirmedBy: actor.id, confirmedAt: nowIso(deps) };
      repos.tx(() => {
        repos.entries.save(confirmed);
        audit(deps, {
          actorId: actor.id,
          contractId,
          action: "entry.confirm",
          entity: "entry",
          entityId: entry.id,
          meta: { date },
        });
      });
      return confirmed;
    },

    clock(actor: Actor, contractId: string, action: "in" | "out"): WorkEntry {
      const located = loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "entry:clock");
      if (located.contract.status === "ended")
        throw new AppError("CONFLICT", "Este vínculo está encerrado");
      const { date, time } = nowInZone(located.timezone, deps.clock());
      assertWithinContract(located, date);

      const existing = repos.entries.find(contractId, date);
      const checkedIn = existing?.status === "worked" && existing.checkIn !== null;
      let fields: EntryFields;
      if (action === "in") {
        if (checkedIn) throw new AppError("CONFLICT", "A entrada de hoje já foi registrada");
        fields = {
          status: "worked",
          checkIn: time,
          checkOut: null,
          breakMinutes: 0,
          note: existing?.note ?? null,
        };
      } else {
        if (!existing || !checkedIn)
          throw new AppError("CONFLICT", "Nenhuma entrada registrada hoje");
        if (existing.checkOut) throw new AppError("CONFLICT", "A saída de hoje já foi registrada");
        fields = {
          status: existing.status,
          checkIn: existing.checkIn,
          checkOut: time,
          breakMinutes: existing.breakMinutes,
          note: existing.note,
        };
      }

      return repos.tx(() => {
        const entry = write(actor, contractId, date, fields, existing);
        audit(deps, {
          actorId: actor.id,
          contractId,
          action: action === "in" ? "entry.clock_in" : "entry.clock_out",
          entity: "entry",
          entityId: entry.id,
          meta: { date, time },
        });
        return entry;
      });
    },
  };
}
