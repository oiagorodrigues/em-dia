import type { ReadStream } from "node:fs";
import type { CreatePaymentInput, Payment, Receipt, ReceiptMimeType } from "@emdia/shared";
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from "@emdia/shared";
import { fileTypeFromBuffer } from "file-type";
import { AppError, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import { toPayment, type PaymentRecord } from "../repos/index.ts";
import { loadContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
}

export interface ReceiptDownload {
  stream: ReadStream;
  mimeType: ReceiptMimeType;
  sizeBytes: number;
  filename: string;
}

const EXTENSION: Record<ReceiptMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const isReceiptMime = (mime: string): mime is ReceiptMimeType =>
  (RECEIPT_MIME_TYPES as readonly string[]).includes(mime);

/** Display only: strips any path, control and markup characters. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 100);
  return cleaned || "comprovante";
}

export function paymentsService(deps: ServiceDeps) {
  const { repos, files } = deps;

  async function storeReceipt(file: UploadedFile): Promise<{ name: string; receipt: Receipt }> {
    if (file.buffer.length > RECEIPT_MAX_BYTES) {
      throw new AppError("PAYLOAD_TOO_LARGE", "O comprovante deve ter no máximo 5 MB");
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !isReceiptMime(detected.mime)) {
      throw new AppError(
        "UNSUPPORTED_MEDIA",
        "Envie o comprovante como imagem (JPG, PNG, WEBP) ou PDF",
      );
    }
    const name = await files.save(file.buffer, EXTENSION[detected.mime]);
    return {
      name,
      receipt: {
        mimeType: detected.mime,
        sizeBytes: file.buffer.length,
        originalName: sanitizeFilename(file.originalName),
        uploadedAt: nowIso(deps),
      },
    };
  }

  function findPayment(contractId: string, paymentId: string): PaymentRecord {
    const payment = repos.payments.find(contractId, paymentId);
    if (!payment) throw notFound("Pagamento não encontrado");
    return payment;
  }

  /** The DB row is the source of truth; an orphaned file is harmless, so removal failures are only logged. */
  async function discardFile(name: string) {
    try {
      await files.remove(name);
    } catch (err) {
      deps.logger.warn("failed to remove receipt file", { err, file: name });
    }
  }

  return {
    list(actor: Actor, contractId: string, year: number | undefined): Payment[] {
      loadContract(deps, actor, contractId);
      return repos.payments.list(contractId, year).map(toPayment);
    },

    async create(
      actor: Actor,
      contractId: string,
      input: CreatePaymentInput,
      file?: UploadedFile,
    ): Promise<Payment> {
      loadContract(deps, actor, contractId);
      requirePermission(actor, "payment:write");
      const stored = file ? await storeReceipt(file) : undefined;
      const payment: PaymentRecord = {
        id: newId(),
        contractId,
        referenceMonth: input.referenceMonth,
        paidOn: input.paidOn,
        amountCents: input.amountCents,
        method: input.method,
        note: input.note || null,
        receipt: stored?.receipt ?? null,
        receiptFile: stored?.name ?? null,
        acknowledgedAt: null,
        createdBy: actor.id,
        createdAt: nowIso(deps),
      };
      try {
        repos.tx(() => {
          repos.payments.insert(payment);
          audit(deps, {
            actorId: actor.id,
            contractId,
            action: "payment.create",
            entity: "payment",
            entityId: payment.id,
            meta: {
              referenceMonth: payment.referenceMonth,
              amountCents: payment.amountCents,
              receipt: !!stored,
            },
          });
        });
      } catch (err) {
        if (stored) await discardFile(stored.name);
        throw err;
      }
      return toPayment(payment);
    },

    async replaceReceipt(
      actor: Actor,
      contractId: string,
      paymentId: string,
      file: UploadedFile,
    ): Promise<Payment> {
      loadContract(deps, actor, contractId);
      requirePermission(actor, "payment:write");
      const previous = findPayment(contractId, paymentId);
      const stored = await storeReceipt(file);
      repos.tx(() => {
        repos.payments.setReceipt(paymentId, stored.name, stored.receipt);
        audit(deps, {
          actorId: actor.id,
          contractId,
          action: "payment.receipt",
          entity: "payment",
          entityId: paymentId,
        });
      });
      if (previous.receiptFile) await discardFile(previous.receiptFile);
      return toPayment({ ...previous, receipt: stored.receipt, receiptFile: stored.name });
    },

    openReceipt(actor: Actor, contractId: string, paymentId: string): ReceiptDownload {
      loadContract(deps, actor, contractId);
      requirePermission(actor, "receipt:read");
      const payment = findPayment(contractId, paymentId);
      if (!payment.receipt || !payment.receiptFile)
        throw notFound("Este pagamento não tem comprovante");
      return {
        stream: files.open(payment.receiptFile),
        mimeType: payment.receipt.mimeType,
        sizeBytes: payment.receipt.sizeBytes,
        filename: `comprovante-${payment.referenceMonth}.${EXTENSION[payment.receipt.mimeType]}`,
      };
    },

    async remove(actor: Actor, contractId: string, paymentId: string): Promise<void> {
      loadContract(deps, actor, contractId);
      requirePermission(actor, "payment:write");
      const payment = findPayment(contractId, paymentId);
      repos.tx(() => {
        repos.payments.delete(paymentId);
        audit(deps, {
          actorId: actor.id,
          contractId,
          action: "payment.delete",
          entity: "payment",
          entityId: paymentId,
          meta: { referenceMonth: payment.referenceMonth, amountCents: payment.amountCents },
        });
      });
      if (payment.receiptFile) await discardFile(payment.receiptFile);
    },

    acknowledge(actor: Actor, contractId: string, paymentId: string): Payment {
      loadContract(deps, actor, contractId);
      requirePermission(actor, "payment:acknowledge");
      const payment = findPayment(contractId, paymentId);
      if (payment.acknowledgedAt) return toPayment(payment);
      const acknowledgedAt = nowIso(deps);
      repos.tx(() => {
        repos.payments.acknowledge(paymentId, acknowledgedAt);
        audit(deps, {
          actorId: actor.id,
          contractId,
          action: "payment.acknowledge",
          entity: "payment",
          entityId: paymentId,
        });
      });
      return toPayment({ ...payment, acknowledgedAt });
    },
  };
}
