import type { Payment, PaymentMethod, Receipt, ReceiptMimeType, YearMonth } from "@emdia/shared";
import type { Executor } from "../db/index.ts";

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
  agreement_id: string | null;
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
    agreementId: r.agreement_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    receiptFile: r.receipt_file,
  };
}

export function toPayment({ receiptFile: _file, ...payment }: PaymentRecord): Payment {
  return payment;
}

const NEWEST_FIRST = "ORDER BY paid_on DESC, created_at DESC, id";

export function paymentsRepo(db: Executor) {
  return {
    async list(contractId: string, year: number | undefined): Promise<PaymentRecord[]> {
      const rows =
        year === undefined
          ? await db.all<Row>(
              `SELECT * FROM payments WHERE contract_id = ? ${NEWEST_FIRST}`,
              contractId,
            )
          : await db.all<Row>(
              `SELECT * FROM payments WHERE contract_id = ? AND substr(reference_month, 1, 4) = ? ${NEWEST_FIRST}`,
              contractId,
              String(year),
            );
      return rows.map(toRecord);
    },

    async listByMonth(contractId: string, month: YearMonth): Promise<PaymentRecord[]> {
      return (
        await db.all<Row>(
          `SELECT * FROM payments WHERE contract_id = ? AND reference_month = ? ${NEWEST_FIRST}`,
          contractId,
          month,
        )
      ).map(toRecord);
    },

    async latest(contractId: string): Promise<PaymentRecord | undefined> {
      const r = await db.get<Row>(
        `SELECT * FROM payments WHERE contract_id = ? ${NEWEST_FIRST} LIMIT 1`,
        contractId,
      );
      return r && toRecord(r);
    },

    async find(contractId: string, id: string): Promise<PaymentRecord | undefined> {
      const r = await db.get<Row>(
        "SELECT * FROM payments WHERE contract_id = ? AND id = ?",
        contractId,
        id,
      );
      return r && toRecord(r);
    },

    async listReceiptFiles(contractIds: string[]): Promise<string[]> {
      if (contractIds.length === 0) return [];
      return (
        await db.all<{ receipt_file: string }>(
          `SELECT receipt_file FROM payments
         WHERE receipt_file IS NOT NULL AND contract_id IN (${contractIds.map(() => "?").join(", ")})`,
          ...contractIds,
        )
      ).map((r) => r.receipt_file);
    },

    async insert(p: PaymentRecord): Promise<void> {
      await db.run(
        `INSERT INTO payments (id, contract_id, reference_month, paid_on, amount_cents, method, note, receipt_file,
           receipt_mime, receipt_size, receipt_name, receipt_uploaded_at, acknowledged_at, agreement_id, created_by,
           created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        p.agreementId,
        p.createdBy,
        p.createdAt,
      );
    },

    async setReceipt(id: string, file: string, receipt: Receipt): Promise<void> {
      await db.run(
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

    async acknowledge(id: string, at: string): Promise<void> {
      await db.run(
        "UPDATE payments SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL",
        at,
        id,
      );
    },

    async delete(id: string): Promise<void> {
      await db.run("DELETE FROM payments WHERE id = ?", id);
    },
  };
}
