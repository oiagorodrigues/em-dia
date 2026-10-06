import type {
  ClockTime,
  Contract,
  ContractStatus,
  IsoDate,
  Occupation,
  PayType,
  Schedule,
  ScheduleKind,
} from "@emdia/shared";
import { execute, queryAll, queryOne, type Db, type Param } from "../db/index.ts";

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
  contactEmail: string | null;
  contactPhone: string | null;
  expectedStart: ClockTime | null;
  expectedEnd: ClockTime | null;
  startedOn: IsoDate;
}

interface Row {
  id: string;
  household_id: string;
  household_name: string;
  employer_id: string;
  employer_name: string;
  worker_phone: string | null;
  worker_pix_key: string | null;
  timezone: string;
  worker_id: string | null;
  worker_name: string;
  occupation: Occupation;
  pay_type: PayType;
  rate_cents: number;
  schedule_kind: ScheduleKind;
  schedule_weekdays: string;
  every_weeks: number;
  month_days: string;
  visits_per_month: number | null;
  deduct_absences: number;
  contact_email: string | null;
  contact_phone: string | null;
  archived_at: string | null;
  expected_start: string | null;
  expected_end: string | null;
  started_on: string;
  ended_on: string | null;
  status: ContractStatus;
  created_at: string;
}

const SELECT = `
  SELECT c.*, h.name AS household_name, h.owner_id AS employer_id, u.name AS employer_name, h.timezone,
    w.phone AS worker_phone, w.pix_key AS worker_pix_key
  FROM contracts c
  JOIN households h ON h.id = c.household_id
  JOIN users u ON u.id = h.owner_id
  LEFT JOIN users w ON w.id = c.worker_id`;

const NOT_ARCHIVED = "AND c.archived_at IS NULL";
const ORDER = "ORDER BY c.status = 'ended', c.created_at, c.id";

function scheduleParams(f: ContractFields): Param[] {
  return [
    f.schedule.kind,
    JSON.stringify(f.schedule.weekdays),
    f.schedule.everyWeeks,
    JSON.stringify(f.schedule.monthDays),
    f.schedule.visitsPerMonth,
    f.deductAbsences ? 1 : 0,
    f.contactEmail,
    f.contactPhone,
  ];
}

function toLocated(r: Row): LocatedContract {
  return {
    timezone: r.timezone,
    contract: {
      id: r.id,
      householdId: r.household_id,
      householdName: r.household_name,
      employerId: r.employer_id,
      employerName: r.employer_name,
      workerId: r.worker_id,
      workerName: r.worker_name,
      workerPhone: r.worker_phone,
      workerPixKey: r.worker_pix_key,
      occupation: r.occupation,
      payType: r.pay_type,
      rateCents: r.rate_cents,
      schedule: {
        kind: r.schedule_kind,
        weekdays: JSON.parse(r.schedule_weekdays) as number[],
        everyWeeks: r.every_weeks,
        monthDays: JSON.parse(r.month_days) as number[],
        visitsPerMonth: r.visits_per_month,
      },
      deductAbsences: r.deduct_absences === 1,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      archivedAt: r.archived_at,
      expectedStart: r.expected_start,
      expectedEnd: r.expected_end,
      startedOn: r.started_on,
      endedOn: r.ended_on,
      status: r.status,
      createdAt: r.created_at,
    },
  };
}

export function contractsRepo(db: Db) {
  return {
    findById(id: string): LocatedContract | undefined {
      const r = queryOne<Row>(db, `${SELECT} WHERE c.id = ?`, id);
      return r && toLocated(r);
    },

    listForEmployer(ownerId: string, includeArchived = false): LocatedContract[] {
      return queryAll<Row>(
        db,
        `${SELECT} WHERE h.owner_id = ? ${includeArchived ? "" : NOT_ARCHIVED} ${ORDER}`,
        ownerId,
      ).map(toLocated);
    },

    listForWorker(workerId: string, includeArchived = false): LocatedContract[] {
      return queryAll<Row>(
        db,
        `${SELECT} WHERE c.worker_id = ? ${includeArchived ? "" : NOT_ARCHIVED} ${ORDER}`,
        workerId,
      ).map(toLocated);
    },

    insert(c: { id: string; householdId: string; createdAt: string } & ContractFields): void {
      execute(
        db,
        `INSERT INTO contracts (id, household_id, worker_name, occupation, pay_type, rate_cents, schedule_kind,
           schedule_weekdays, every_weeks, month_days, visits_per_month, deduct_absences, contact_email,
           contact_phone, expected_start, expected_end, started_on, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        c.id,
        c.householdId,
        c.workerName,
        c.occupation,
        c.payType,
        c.rateCents,
        ...scheduleParams(c),
        c.expectedStart,
        c.expectedEnd,
        c.startedOn,
        c.createdAt,
      );
    },

    update(id: string, f: ContractFields): void {
      execute(
        db,
        `UPDATE contracts SET worker_name = ?, occupation = ?, pay_type = ?, rate_cents = ?, schedule_kind = ?,
           schedule_weekdays = ?, every_weeks = ?, month_days = ?, visits_per_month = ?, deduct_absences = ?,
           contact_email = ?, contact_phone = ?, expected_start = ?, expected_end = ?, started_on = ?
         WHERE id = ?`,
        f.workerName,
        f.occupation,
        f.payType,
        f.rateCents,
        ...scheduleParams(f),
        f.expectedStart,
        f.expectedEnd,
        f.startedOn,
        id,
      );
    },

    end(id: string, endedOn: IsoDate): void {
      execute(db, "UPDATE contracts SET ended_on = ?, status = 'ended' WHERE id = ?", endedOn, id);
    },

    setArchivedAt(id: string, archivedAt: string | null): void {
      execute(db, "UPDATE contracts SET archived_at = ? WHERE id = ?", archivedAt, id);
    },

    unlinkWorker(workerId: string): void {
      execute(db, "UPDATE contracts SET worker_id = NULL WHERE worker_id = ?", workerId);
    },

    linkWorker(id: string, workerId: string): void {
      execute(db, "UPDATE contracts SET worker_id = ? WHERE id = ?", workerId, id);
    },
  };
}
