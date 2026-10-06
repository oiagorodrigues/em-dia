import type { EntryStatus, IsoDate, Role, WorkEntry, YearMonth } from "@ponto/shared";
import { execute, queryAll, queryOne, type Db } from "../db/index.ts";

interface Row {
  id: string;
  contract_id: string;
  date: string;
  status: EntryStatus;
  check_in: string | null;
  check_out: string | null;
  break_minutes: number;
  minutes: number;
  note: string | null;
  created_by: string;
  created_by_role: Role;
  confirmed_by: string | null;
  confirmed_at: string | null;
  updated_at: string;
}

const toEntry = (r: Row): WorkEntry => ({
  id: r.id,
  contractId: r.contract_id,
  date: r.date,
  status: r.status,
  checkIn: r.check_in,
  checkOut: r.check_out,
  breakMinutes: r.break_minutes,
  minutes: r.minutes,
  note: r.note,
  createdBy: r.created_by,
  createdByRole: r.created_by_role,
  confirmedBy: r.confirmed_by,
  confirmedAt: r.confirmed_at,
  updatedAt: r.updated_at,
});

export function entriesRepo(db: Db) {
  return {
    listByMonth(contractId: string, month: YearMonth): WorkEntry[] {
      return queryAll<Row>(
        db,
        "SELECT * FROM work_entries WHERE contract_id = ? AND substr(date, 1, 7) = ? ORDER BY date",
        contractId,
        month,
      ).map(toEntry);
    },

    find(contractId: string, date: IsoDate): WorkEntry | undefined {
      const r = queryOne<Row>(
        db,
        "SELECT * FROM work_entries WHERE contract_id = ? AND date = ?",
        contractId,
        date,
      );
      return r && toEntry(r);
    },

    /** Insert or full replace of the (contract, date) row. */
    save(e: WorkEntry): void {
      execute(
        db,
        `INSERT INTO work_entries (id, contract_id, date, status, check_in, check_out, break_minutes, minutes, note,
           created_by, created_by_role, confirmed_by, confirmed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (contract_id, date) DO UPDATE SET status = excluded.status, check_in = excluded.check_in,
           check_out = excluded.check_out, break_minutes = excluded.break_minutes, minutes = excluded.minutes,
           note = excluded.note, created_by = excluded.created_by, created_by_role = excluded.created_by_role,
           confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at, updated_at = excluded.updated_at`,
        e.id,
        e.contractId,
        e.date,
        e.status,
        e.checkIn,
        e.checkOut,
        e.breakMinutes,
        e.minutes,
        e.note,
        e.createdBy,
        e.createdByRole,
        e.confirmedBy,
        e.confirmedAt,
        e.updatedAt,
      );
    },

    delete(contractId: string, date: IsoDate): void {
      execute(db, "DELETE FROM work_entries WHERE contract_id = ? AND date = ?", contractId, date);
    },
  };
}
