import type { Payment, PaymentMethod, Receipt, ReceiptMimeType, YearMonth } from "@emdia/shared";
import { execute, queryAll, queryOne, type Db } from "../db/index.ts";

/** `receiptFile` is the storage name; it never leaves the API. */
export interface PaymentRecord extends Payment {
  receiptFile: string | null;
}

interface Row {
  id: string;
  contract_id: string;
  reference_month: string;
  paid_on: string;
  amount_cents: number;
  method: PaymentMethod;
  note: string | null;
  receipt_file: string | null;
  receipt_mime: ReceiptMimeType | null;
  receipt_size: number | null;
  receipt_name: string | null;
  receipt_uploaded_at: string | null;
  acknowledged_at: string | null;
  created_by: string;
  created_at: string;
}

function toRecord(r: Row): PaymentRecord {
  const receipt: Receipt | null =
    r.receipt_file && r.receipt_mime
      ? {
          mimeType: r.receipt_mime,
          sizeBytes: r.receipt_size ?? 0,
          originalName: r.receipt_name ?? "",
          uploadedAt: r.receipt_uploaded_at ?? r.created_at,
        }
      : null;
  return {
    id: r.id,
    contractId: r.contract_id,
    referenceMonth: r.reference_month,
    paidOn: r.paid_on,
    amountCents: r.amount_cents,
    method: r.method,
    note: r.note,
    receipt,
    acknowledgedAt: r.acknowledged_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    receiptFile: r.receipt_file,
  };
}

export function toPayment({ receiptFile: _file, ...payment }: PaymentRecord): Payment {
  return payment;
}

const NEWEST_FIRST = "ORDER BY paid_on DESC, created_at DESC, id";

export function paymentsRepo(db: Db) {
  return {
    list(contractId: string, year: number | undefined): PaymentRecord[] {
      const rows =
        year === undefined
          ? queryAll<Row>(
              db,
              `SELECT * FROM payments WHERE contract_id = ? ${NEWEST_FIRST}`,
              contractId,
            )
          : queryAll<Row>(
              db,
              `SELECT * FROM payments WHERE contract_id = ? AND substr(reference_month, 1, 4) = ? ${NEWEST_FIRST}`,
              contractId,
              String(year),
            );
      return rows.map(toRecord);
    },

    listByMonth(contractId: string, month: YearMonth): PaymentRecord[] {
      return queryAll<Row>(
        db,
        `SELECT * FROM payments WHERE contract_id = ? AND reference_month = ? ${NEWEST_FIRST}`,
        contractId,
        month,
      ).map(toRecord);
    },

    latest(contractId: string): PaymentRecord | undefined {
      const r = queryOne<Row>(
        db,
        `SELECT * FROM payments WHERE contract_id = ? ${NEWEST_FIRST} LIMIT 1`,
        contractId,
      );
      return r && toRecord(r);
    },

    find(contractId: string, id: string): PaymentRecord | undefined {
      const r = queryOne<Row>(
        db,
        "SELECT * FROM payments WHERE contract_id = ? AND id = ?",
        contractId,
        id,
      );
      return r && toRecord(r);
    },

    listReceiptFiles(contractIds: string[]): string[] {
      if (contractIds.length === 0) return [];
      return queryAll<{ receipt_file: string }>(
        db,
        `SELECT receipt_file FROM payments
         WHERE receipt_file IS NOT NULL AND contract_id IN (${contractIds.map(() => "?").join(", ")})`,
        ...contractIds,
      ).map((r) => r.receipt_file);
    },

    insert(p: PaymentRecord): void {
      execute(
        db,
        `INSERT INTO payments (id, contract_id, reference_month, paid_on, amount_cents, method, note, receipt_file,
           receipt_mime, receipt_size, receipt_name, receipt_uploaded_at, acknowledged_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.contractId,
        p.referenceMonth,
        p.paidOn,
        p.amountCents,
        p.method,
        p.note,
        p.receiptFile,
        p.receipt?.mimeType ?? null,
        p.receipt?.sizeBytes ?? null,
        p.receipt?.originalName ?? null,
        p.receipt?.uploadedAt ?? null,
        p.acknowledgedAt,
        p.createdBy,
        p.createdAt,
      );
    },

    setReceipt(id: string, file: string, receipt: Receipt): void {
      execute(
        db,
        `UPDATE payments SET receipt_file = ?, receipt_mime = ?, receipt_size = ?, receipt_name = ?,
           receipt_uploaded_at = ?
         WHERE id = ?`,
        file,
        receipt.mimeType,
        receipt.sizeBytes,
        receipt.originalName,
        receipt.uploadedAt,
        id,
      );
    },

    acknowledge(id: string, at: string): void {
      execute(
        db,
        "UPDATE payments SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL",
        at,
        id,
      );
    },

    delete(id: string): void {
      execute(db, "DELETE FROM payments WHERE id = ?", id);
    },
  };
}
