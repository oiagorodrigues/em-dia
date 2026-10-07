import type { Payment, Receipt, Role, YearMonth } from "@emdia/shared";
import {
  and,
  desc,
  asc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  like,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Executor } from "../db/index.ts";
import { agreements, payments } from "../db/schema.ts";
import { date, dateOrNull, iso, isoOrNull } from "./convert.ts";

/** `receiptFile` is the storage name; it never leaves the API. */
export interface PaymentRecord extends Payment {
  receiptFile: string | null;
}

function toRecord(r: typeof payments.$inferSelect & { settledCents: number }): PaymentRecord {
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
    kind: r.kind,
    method: r.method,
    note: r.note,
    receipt,
    acknowledgedAt: isoOrNull(r.acknowledgedAt),
    acknowledgedBy: r.acknowledgedBy,
    acknowledgedByRole: r.acknowledgedByRole,
    agreementId: r.agreementId,
    advanceId: r.advanceId,
    settledCents: r.kind === "advance" ? r.settledCents : null,
    remainingCents: r.kind === "advance" ? Math.max(0, r.amountCents - r.settledCents) : null,
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

  /** What has been abated from each adiantamento, derived from the payments that point at it. */
  const abatements = alias(payments, "abatements");
  const settled = db
    .select({
      advanceId: abatements.advanceId,
      cents: sql<number>`sum(${abatements.amountCents})`.as("cents"),
    })
    .from(abatements)
    .where(isNotNull(abatements.advanceId))
    .groupBy(abatements.advanceId)
    .as("settled");

  const select = async (where: SQL | undefined, limit?: number) => {
    const query = db
      .select({
        ...getTableColumns(payments),
        settledCents: sql<number>`coalesce(${settled.cents}, 0)`.mapWith(Number),
      })
      .from(payments)
      .leftJoin(settled, eq(settled.advanceId, payments.id))
      .where(and(where, notInRemovedAgreement))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt), asc(payments.id));
    return (await (limit ? query.limit(limit) : query)).map(toRecord);
  };

  return {
    /** Every adiantamento of the contract, newest first, with what is left to abate. */
    listAdvances(contractId: string): Promise<PaymentRecord[]> {
      return select(and(eq(payments.contractId, contractId), eq(payments.kind, "advance")));
    },

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

    /** The latest entry where money changed hands; a desconto is never "the last payment". */
    async latest(contractId: string): Promise<PaymentRecord | undefined> {
      return (
        await select(and(eq(payments.contractId, contractId), isNotNull(payments.method)), 1)
      )[0];
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
        acknowledgedBy: p.acknowledgedBy,
        acknowledgedByRole: p.acknowledgedByRole,
        kind: p.kind,
        agreementId: p.agreementId,
        advanceId: p.advanceId,
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

    async acknowledge(id: string, at: string, by: string, role: Role): Promise<void> {
      await db
        .update(payments)
        .set({ acknowledgedAt: date(at), acknowledgedBy: by, acknowledgedByRole: role })
        .where(and(eq(payments.id, id), isNull(payments.acknowledgedAt)));
    },

    /** Writes the editable fields; `acknowledged*` are written as given so an edit can reopen it. */
    async update(p: PaymentRecord): Promise<void> {
      await db
        .update(payments)
        .set({
          referenceMonth: p.referenceMonth,
          paidOn: p.paidOn,
          amountCents: p.amountCents,
          kind: p.kind,
          method: p.method,
          note: p.note,
          agreementId: p.agreementId,
          advanceId: p.advanceId,
          acknowledgedAt: dateOrNull(p.acknowledgedAt),
          acknowledgedBy: p.acknowledgedBy,
          acknowledgedByRole: p.acknowledgedByRole,
        })
        .where(eq(payments.id, p.id));
    },

    async delete(id: string): Promise<void> {
      await db.delete(payments).where(eq(payments.id, id));
    },
  };
}
