import type { ClockTime, Contract, IsoDate, Occupation, PayType, Schedule } from "@emdia/shared";
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import type { Executor } from "../db/index.ts";
import { contracts, households, users } from "../db/schema.ts";
import { date, dateOrNull, iso, isoOrNull } from "./convert.ts";

/** A contract plus the timezone of its household, which every "today" computation needs. */
export interface LocatedContract {
  contract: Contract;
  timezone: string;
}

export interface ContractFields {
  workerName: string;
  occupation: Occupation;
  payType: PayType;
  rateCents: number;
  schedule: Schedule;
  deductAbsences: boolean;
  nightBonus: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  expectedStart: ClockTime | null;
  expectedEnd: ClockTime | null;
  startedOn: IsoDate;
}

/** jsonb columns are typed by declaration only; the read path checks their shape. */
const contractRow = createSelectSchema(contracts, {
  scheduleWeekdays: z.array(z.number().int().min(0).max(6)),
  monthDays: z.array(z.number().int().min(1).max(31)),
});

const owner = alias(users, "owner");
const worker = alias(users, "worker");

function columnsOf(f: ContractFields) {
  return {
    workerName: f.workerName,
    occupation: f.occupation,
    payType: f.payType,
    rateCents: f.rateCents,
    scheduleKind: f.schedule.kind,
    scheduleWeekdays: f.schedule.weekdays,
    everyWeeks: f.schedule.everyWeeks,
    monthDays: f.schedule.monthDays,
    visitsPerMonth: f.schedule.visitsPerMonth,
    deductAbsences: f.deductAbsences,
    nightBonus: f.nightBonus,
    contactEmail: f.contactEmail,
    contactPhone: f.contactPhone,
    expectedStart: f.expectedStart,
    expectedEnd: f.expectedEnd,
    startedOn: f.startedOn,
  };
}

export function contractsRepo(db: Executor) {
  async function select(where: SQL | undefined): Promise<LocatedContract[]> {
    const rows = await db
      .select({
        c: contracts,
        householdName: households.name,
        timezone: households.timezone,
        employerId: owner.id,
        employerName: owner.name,
        workerEmail: worker.email,
        workerPhone: worker.phone,
        workerPixKey: worker.pixKey,
      })
      .from(contracts)
      .innerJoin(households, eq(households.id, contracts.householdId))
      .innerJoin(owner, eq(owner.id, households.ownerId))
      .leftJoin(worker, eq(worker.id, contracts.workerId))
      .where(where)
      .orderBy(sql`${contracts.status} = 'ended'`, asc(contracts.createdAt), asc(contracts.id));

    return rows.map(({ c: raw, ...joined }) => {
      const c = contractRow.parse(raw);
      return {
        timezone: joined.timezone,
        contract: {
          id: c.id,
          householdId: c.householdId,
          householdName: joined.householdName,
          employerId: joined.employerId,
          employerName: joined.employerName,
          workerId: c.workerId,
          workerName: c.workerName,
          workerEmail: joined.workerEmail,
          workerPhone: joined.workerPhone,
          workerPixKey: joined.workerPixKey,
          contactEmail: c.contactEmail,
          contactPhone: c.contactPhone,
          occupation: c.occupation,
          payType: c.payType,
          rateCents: c.rateCents,
          schedule: {
            kind: c.scheduleKind,
            weekdays: c.scheduleWeekdays,
            everyWeeks: c.everyWeeks,
            monthDays: c.monthDays,
            visitsPerMonth: c.visitsPerMonth,
          },
          deductAbsences: c.deductAbsences,
          nightBonus: c.nightBonus,
          expectedStart: c.expectedStart,
          expectedEnd: c.expectedEnd,
          startedOn: c.startedOn,
          endedOn: c.endedOn,
          status: c.status,
          archivedAt: isoOrNull(c.archivedAt),
          createdAt: iso(c.createdAt),
        },
      };
    });
  }

  const visible = (includeArchived: boolean) =>
    includeArchived ? undefined : isNull(contracts.archivedAt);

  return {
    async findById(id: string): Promise<LocatedContract | undefined> {
      return (await select(eq(contracts.id, id)))[0];
    },

    listForEmployer(ownerId: string, includeArchived = false): Promise<LocatedContract[]> {
      return select(and(eq(households.ownerId, ownerId), visible(includeArchived)));
    },

    listForWorker(workerId: string, includeArchived = false): Promise<LocatedContract[]> {
      return select(and(eq(contracts.workerId, workerId), visible(includeArchived)));
    },

    async insert(
      c: { id: string; householdId: string; createdAt: string } & ContractFields,
    ): Promise<void> {
      await db.insert(contracts).values({
        id: c.id,
        householdId: c.householdId,
        createdAt: date(c.createdAt),
        status: "active",
        ...columnsOf(c),
      });
    },

    async update(id: string, f: ContractFields): Promise<void> {
      await db.update(contracts).set(columnsOf(f)).where(eq(contracts.id, id));
    },

    async end(id: string, endedOn: IsoDate): Promise<void> {
      await db.update(contracts).set({ endedOn, status: "ended" }).where(eq(contracts.id, id));
    },

    async setArchivedAt(id: string, archivedAt: string | null): Promise<void> {
      await db
        .update(contracts)
        .set({ archivedAt: dateOrNull(archivedAt) })
        .where(eq(contracts.id, id));
    },

    async unlinkWorker(workerId: string): Promise<void> {
      await db.update(contracts).set({ workerId: null }).where(eq(contracts.workerId, workerId));
    },

    async linkWorker(id: string, workerId: string): Promise<void> {
      await db.update(contracts).set({ workerId }).where(eq(contracts.id, id));
    },
  };
}
