import type { Payment, Receipt, YearMonth } from "@emdia/shared";
import {
  and,
  desc,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  notExists,
  or,
  type SQL,
} from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { agreements, payments } from "../db/schema.ts";
import { date, dateOrNull, iso, isoOrNull } from "./convert.ts";

/** `receiptFile` is the storage name; it never leaves the API. */
export interface PaymentRecord extends Payment {
  receiptFile: string | null;
}

function toRecord(r: typeof payments.$inferSelect): PaymentRecord {
  const receipt: Receipt | null =
    r.receiptFile && r.receiptMime
      ? {
          mimeType: r.receiptMime,
          sizeBytes: r.receiptSize ?? 0,
          originalName: r.receiptName ?? "",
          uploadedAt: iso(r.receiptUploadedAt ?? r.createdAt),
        }
      : null;
  return {
    id: r.id,
    contractId: r.contractId,
    referenceMonth: r.referenceMonth,
    paidOn: r.paidOn,
    amountCents: r.amountCents,
    method: r.method,
    note: r.note,
    receipt,
    acknowledgedAt: isoOrNull(r.acknowledgedAt),
    agreementId: r.agreementId,
    createdBy: r.createdBy,
    createdAt: iso(r.createdAt),
    receiptFile: r.receiptFile,
  };
}

export function toPayment({ receiptFile: _file, ...payment }: PaymentRecord): Payment {
  return payment;
}

export function paymentsRepo(db: Executor) {
  /** Installments of a removed agreement stay in the table but out of every list and total. */
  const notInRemovedAgreement = or(
    isNull(payments.agreementId),
    notExists(
      db
        .select({ id: agreements.id })
        .from(agreements)
        .where(and(eq(agreements.id, payments.agreementId), isNotNull(agreements.archivedAt))),
    ),
  );

  const select = async (where: SQL | undefined, limit?: number) => {
    const query = db
      .select()
      .from(payments)
      .where(and(where, notInRemovedAgreement))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt), asc(payments.id));
    return (await (limit ? query.limit(limit) : query)).map(toRecord);
  };

  return {
    list(contractId: string, year: number | undefined): Promise<PaymentRecord[]> {
      return select(
        and(
          eq(payments.contractId, contractId),
          year === undefined ? undefined : like(payments.referenceMonth, `${year}-%`),
        ),
      );
    },

    listByMonth(contractId: string, month: YearMonth): Promise<PaymentRecord[]> {
      return select(and(eq(payments.contractId, contractId), eq(payments.referenceMonth, month)));
    },

    async latest(contractId: string): Promise<PaymentRecord | undefined> {
      return (await select(eq(payments.contractId, contractId), 1))[0];
    },

    async find(contractId: string, id: string): Promise<PaymentRecord | undefined> {
      return (await select(and(eq(payments.contractId, contractId), eq(payments.id, id))))[0];
    },

    async listReceiptFiles(contractIds: string[]): Promise<string[]> {
      if (contractIds.length === 0) return [];
      const rows = await db
        .select({ file: payments.receiptFile })
        .from(payments)
        .where(and(inArray(payments.contractId, contractIds), isNotNull(payments.receiptFile)));
      return rows.flatMap((r) => (r.file ? [r.file] : []));
    },

    async insert(p: PaymentRecord): Promise<void> {
      await db.insert(payments).values({
        id: p.id,
        contractId: p.contractId,
        referenceMonth: p.referenceMonth,
        paidOn: p.paidOn,
        amountCents: p.amountCents,
        method: p.method,
        note: p.note,
        receiptFile: p.receiptFile,
        receiptMime: p.receipt?.mimeType ?? null,
        receiptSize: p.receipt?.sizeBytes ?? null,
        receiptName: p.receipt?.originalName ?? null,
        receiptUploadedAt: dateOrNull(p.receipt?.uploadedAt ?? null),
        acknowledgedAt: dateOrNull(p.acknowledgedAt),
        agreementId: p.agreementId,
        createdBy: p.createdBy,
        createdAt: date(p.createdAt),
      });
    },

    async setReceipt(id: string, file: string, receipt: Receipt): Promise<void> {
      await db
        .update(payments)
        .set({
          receiptFile: file,
          receiptMime: receipt.mimeType,
          receiptSize: receipt.sizeBytes,
          receiptName: receipt.originalName,
          receiptUploadedAt: date(receipt.uploadedAt),
        })
        .where(eq(payments.id, id));
    },

    async acknowledge(id: string, at: string): Promise<void> {
      await db
        .update(payments)
        .set({ acknowledgedAt: date(at) })
        .where(and(eq(payments.id, id), isNull(payments.acknowledgedAt)));
    },

    async delete(id: string): Promise<void> {
      await db.delete(payments).where(eq(payments.id, id));
    },
  };
}
