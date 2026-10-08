import type { EntryStatus, IsoDate, UpsertEntryInput, WorkEntry, YearMonth } from "@emdia/shared";
import { addDays, MAX_STAY_DAYS, nowInZone, stayMinutes } from "@emdia/shared";
import { AppError, fieldError, forbidden, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import type { LocatedContract, TxRepos } from "../repos/index.ts";
import { loadContract, loadWritableContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

const FUTURE_ALLOWED = new Set<EntryStatus>(["day_off", "holiday", "excused"]);

type EntryFields = Pick<
  WorkEntry,
  "status" | "checkIn" | "checkOut" | "checkOutDate" | "breakMinutes" | "note"
>;

function computeMinutes(date: IsoDate, f: EntryFields): number {
  return f.status === "worked" && f.checkIn && f.checkOut
    ? stayMinutes({
        date,
        checkIn: f.checkIn,
        checkOut: f.checkOut,
        checkOutDate: f.checkOutDate,
        breakMinutes: f.breakMinutes,
      })
    : 0;
}

/**
 * A stay that ends on a later date covers the days in between: none of them may hold its own
 * entry, and a new entry may not start inside someone else's stay.
 */
async function assertNoOverlap(
  r: TxRepos,
  contractId: string,
  date: IsoDate,
  checkOutDate: IsoDate | null,
): Promise<void> {
  const nearby = await r.entries.listBetween(
    contractId,
    addDays(date, -MAX_STAY_DAYS),
    checkOutDate ?? date,
  );
  const covering = nearby.find(
    (e) => e.date < date && e.checkOutDate !== null && e.checkOutDate > date,
  );
  if (covering)
    throw fieldError(
      "date",
      `Este dia faz parte do plantão de ${covering.date.split("-").reverse().join("/")}. Edite aquele registro.`,
    );
  const inside = checkOutDate
    ? nearby.find((e) => e.date > date && e.date < checkOutDate)
    : undefined;
  if (inside)
    throw fieldError(
      "checkOutDate",
      `Já tem registro em ${inside.date.split("-").reverse().join("/")}, no meio deste plantão`,
    );
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
  async function write(
    r: TxRepos,
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
      minutes: computeMinutes(date, fields),
      createdBy: actor.id,
      createdByRole: actor.role,
      confirmedBy: null,
      confirmedAt: null,
      updatedAt: nowIso(deps),
    };
    await r.entries.save(entry);
    return entry;
  }

  async function findEntry(contractId: string, date: IsoDate): Promise<WorkEntry> {
    const entry = await repos.entries.find(contractId, date);
    if (!entry) throw notFound("Registro não encontrado");
    return entry;
  }

  return {
    async list(actor: Actor, contractId: string, month: YearMonth): Promise<WorkEntry[]> {
      await loadContract(deps, actor, contractId);
      return repos.entries.listByMonth(contractId, month);
    },

    async upsert(actor: Actor, contractId: string, date: IsoDate, input: UpsertEntryInput) {
      const located = await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "entry:write");
      assertWithinContract(located, date);
      const today = nowInZone(located.timezone, deps.clock()).date;
      if (date > today && !FUTURE_ALLOWED.has(input.status)) {
        throw fieldError("date", "Datas futuras só aceitam folga, feriado ou falta justificada");
      }

      const checkOutDate = input.checkOutDate ?? null;
      if (checkOutDate !== null) {
        if (checkOutDate <= date)
          throw fieldError("checkOutDate", "A saída tem que ser depois do dia da entrada");
        if (checkOutDate > addDays(date, MAX_STAY_DAYS))
          throw fieldError("checkOutDate", `Um registro cobre no máximo ${MAX_STAY_DAYS} dias`);
        if (checkOutDate > today)
          throw fieldError("checkOutDate", "A saída não pode ser no futuro");
      }

      const fields: EntryFields = {
        status: input.status,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        checkOutDate,
        breakMinutes: input.breakMinutes,
        note: input.note || null,
      };
      return repos.tx(async (r) => {
        await assertNoOverlap(r, contractId, date, checkOutDate);
        const existing = await r.entries.find(contractId, date);
        const entry = await write(r, actor, contractId, date, fields, existing);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: existing ? "entry.update" : "entry.create",
            entity: "entry",
            entityId: entry.id,
            meta: { date, status: entry.status },
          },
          r,
        );
        return { entry, created: !existing };
      });
    },

    async remove(actor: Actor, contractId: string, date: IsoDate): Promise<void> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "entry:write");
      const entry = await findEntry(contractId, date);
      if (actor.role !== "employer" && (entry.createdBy !== actor.id || entry.confirmedAt)) {
        throw forbidden("Só quem lançou pode apagar, e apenas antes da confirmação");
      }
      await repos.tx(async (r) => {
        await r.entries.delete(contractId, date);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: "entry.delete",
            entity: "entry",
            entityId: entry.id,
            meta: { date },
          },
          r,
        );
      });
    },

    async confirm(actor: Actor, contractId: string, date: IsoDate): Promise<WorkEntry> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "entry:confirm");
      const entry = await findEntry(contractId, date);
      if (entry.createdBy === actor.id) throw forbidden("A confirmação é feita pela outra parte");
      if (entry.confirmedAt) return entry;

      const confirmed = { ...entry, confirmedBy: actor.id, confirmedAt: nowIso(deps) };
      await repos.tx(async (r) => {
        await r.entries.save(confirmed);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: "entry.confirm",
            entity: "entry",
            entityId: entry.id,
            meta: { date },
          },
          r,
        );
      });
      return confirmed;
    },

    async clock(actor: Actor, contractId: string, action: "in" | "out"): Promise<WorkEntry> {
      const located = await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "entry:clock");
      if (located.contract.status === "ended")
        throw new AppError("CONFLICT", "Este vínculo está encerrado");
      const { date, time } = nowInZone(located.timezone, deps.clock());
      assertWithinContract(located, date);

      return repos.tx(async (r) => {
        const today = await r.entries.find(contractId, date);
        // A plantão checked in on an earlier day is still open: clocking out closes it today.
        const open = (await r.entries.listBetween(contractId, addDays(date, -MAX_STAY_DAYS), date))
          .filter((e) => e.status === "worked" && e.checkIn !== null && e.checkOut === null)
          .at(-1);
        let entryDate = date;
        let existing = today;
        let fields: EntryFields;
        if (action === "in") {
          if (today?.status === "worked" && today.checkIn !== null)
            throw new AppError("CONFLICT", "A entrada de hoje já foi registrada");
          if (open)
            throw new AppError(
              "CONFLICT",
              `A entrada de ${open.date.split("-").reverse().join("/")} ainda está aberta. Registre a saída antes.`,
            );
          fields = {
            status: "worked",
            checkIn: time,
            checkOut: null,
            checkOutDate: null,
            breakMinutes: 0,
            note: today?.note ?? null,
          };
        } else {
          if (!open) {
            if (today?.checkOut)
              throw new AppError("CONFLICT", "A saída de hoje já foi registrada");
            throw new AppError("CONFLICT", "Nenhuma entrada registrada hoje");
          }
          entryDate = open.date;
          existing = open;
          fields = {
            status: open.status,
            checkIn: open.checkIn,
            checkOut: time,
            checkOutDate: open.date === date ? null : date,
            breakMinutes: open.breakMinutes,
            note: open.note,
          };
        }

        const entry = await write(r, actor, contractId, entryDate, fields, existing);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: action === "in" ? "entry.clock_in" : "entry.clock_out",
            entity: "entry",
            entityId: entry.id,
            meta: { date: entryDate, time },
          },
          r,
        );
        return entry;
      });
    },
  };
}
