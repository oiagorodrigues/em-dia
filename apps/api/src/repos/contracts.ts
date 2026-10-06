import type {
  ClockTime,
  Contract,
  ContractStatus,
  IsoDate,
  Occupation,
  PayType,
} from "@ponto/shared";
import { execute, queryAll, queryOne, type Db } from "../db/index.ts";

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
  scheduleDays: number[];
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
  schedule_days: string;
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

const ORDER = "ORDER BY c.status = 'ended', c.created_at, c.id";

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
      scheduleDays: JSON.parse(r.schedule_days) as number[],
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

    listForEmployer(ownerId: string): LocatedContract[] {
      return queryAll<Row>(db, `${SELECT} WHERE h.owner_id = ? ${ORDER}`, ownerId).map(toLocated);
    },

    listForWorker(workerId: string): LocatedContract[] {
      return queryAll<Row>(db, `${SELECT} WHERE c.worker_id = ? ${ORDER}`, workerId).map(toLocated);
    },

    insert(c: { id: string; householdId: string; createdAt: string } & ContractFields): void {
      execute(
        db,
        `INSERT INTO contracts (id, household_id, worker_name, occupation, pay_type, rate_cents, schedule_days,
           expected_start, expected_end, started_on, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        c.id,
        c.householdId,
        c.workerName,
        c.occupation,
        c.payType,
        c.rateCents,
        JSON.stringify(c.scheduleDays),
        c.expectedStart,
        c.expectedEnd,
        c.startedOn,
        c.createdAt,
      );
    },

    update(id: string, f: ContractFields): void {
      execute(
        db,
        `UPDATE contracts SET worker_name = ?, occupation = ?, pay_type = ?, rate_cents = ?, schedule_days = ?,
           expected_start = ?, expected_end = ?, started_on = ?
         WHERE id = ?`,
        f.workerName,
        f.occupation,
        f.payType,
        f.rateCents,
        JSON.stringify(f.scheduleDays),
        f.expectedStart,
        f.expectedEnd,
        f.startedOn,
        id,
      );
    },

    end(id: string, endedOn: IsoDate): void {
      execute(db, "UPDATE contracts SET ended_on = ?, status = 'ended' WHERE id = ?", endedOn, id);
    },

    linkWorker(id: string, workerId: string): void {
      execute(db, "UPDATE contracts SET worker_id = ? WHERE id = ?", workerId, id);
    },
  };
}
