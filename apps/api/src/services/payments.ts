import type { Readable } from "node:stream";
import type {
  CreatePaymentInput,
  Payment,
  Permission,
  Receipt,
  ReceiptMimeType,
  UpdatePaymentInput,
} from "@emdia/shared";
import { formatCents, paymentRuleIssues, RECEIPT_MIME_TYPES } from "@emdia/shared";
import { fileTypeFromBuffer } from "file-type";
import { AppError, fieldError, notFound, receiptTooLarge } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import { toPayment, type PaymentRecord, type TxRepos } from "../repos/index.ts";
import { loadContract, loadWritableContract } from "./access.ts";
import { audit, nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
}

export interface ReceiptDownload {
  stream: Readable;
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

/** Fields a confirmation vouches for; changing one asks for the confirmation again. */
const MONEY_FIELDS = ["referenceMonth", "paidOn", "amountCents", "method", "agreementId"] as const;
const EDITABLE_FIELDS = [...MONEY_FIELDS, "note", "isExtra"] as const;

export function paymentsService(deps: ServiceDeps) {
  const { repos, files } = deps;

  async function storeReceipt(file: UploadedFile): Promise<{ name: string; receipt: Receipt }> {
    if (file.buffer.length > deps.config.receiptMaxBytes) {
      throw receiptTooLarge(deps.config.receiptMaxBytes);
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !isReceiptMime(detected.mime)) {
      throw new AppError(
        "UNSUPPORTED_MEDIA",
        "Envie o comprovante como imagem (JPG, PNG, WEBP) ou PDF",
      );
    }
    const name = await files.save(file.buffer, EXTENSION[detected.mime], detected.mime);
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

  /** Runs before the file is stored and again inside the insert transaction, so concurrent installments can't overpay. */
  async function assertAgreementRoom(
    r: TxRepos,
    contractId: string,
    agreementId: string,
    amountCents: number,
  ): Promise<void> {
    const agreement = await r.agreements.find(contractId, agreementId);
    if (!agreement) throw fieldError("agreementId", "Acordo não encontrado");
    if (agreement.cancelledAt) throw fieldError("agreementId", "Este acordo foi cancelado");
    if (amountCents > agreement.remainingCents) {
      throw fieldError(
        "amountCents",
        `O valor passa do que falta no acordo (${formatCents(agreement.remainingCents)})`,
      );
    }
  }

  async function findPayment(contractId: string, paymentId: string): Promise<PaymentRecord> {
    const payment = await repos.payments.find(contractId, paymentId);
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

  async function markReceived(
    actor: Actor,
    contractId: string,
    paymentId: string,
    permission: Permission,
    action: string,
  ): Promise<Payment> {
    await loadWritableContract(deps, actor, contractId);
    requirePermission(actor, permission);
    const payment = await findPayment(contractId, paymentId);
    if (payment.acknowledgedAt) return toPayment(payment);
    const acknowledgedAt = nowIso(deps);
    await repos.tx(async (r) => {
      await r.payments.acknowledge(paymentId, acknowledgedAt, actor.id, actor.role);
      await audit(
        deps,
        { actorId: actor.id, contractId, action, entity: "payment", entityId: paymentId },
        r,
      );
    });
    return toPayment({
      ...payment,
      acknowledgedAt,
      acknowledgedBy: actor.id,
      acknowledgedByRole: actor.role,
    });
  }

  return {
    async list(actor: Actor, contractId: string, year: number | undefined): Promise<Payment[]> {
      await loadContract(deps, actor, contractId);
      return (await repos.payments.list(contractId, year)).map(toPayment);
    },

    async create(
      actor: Actor,
      contractId: string,
      input: CreatePaymentInput,
      file?: UploadedFile,
    ): Promise<Payment> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "payment:write");
      const agreementId = input.agreementId ?? null;
      if (agreementId) await assertAgreementRoom(repos, contractId, agreementId, input.amountCents);
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
        acknowledgedBy: null,
        acknowledgedByRole: null,
        isExtra: input.isExtra ?? false,
        agreementId,
        createdBy: actor.id,
        createdAt: nowIso(deps),
      };
      try {
        await repos.tx(async (r) => {
          if (agreementId) {
            await assertAgreementRoom(r, contractId, agreementId, payment.amountCents);
          }
          await r.payments.insert(payment);
          await audit(
            deps,
            {
              actorId: actor.id,
              contractId,
              action: "payment.create",
              entity: "payment",
              entityId: payment.id,
              meta: {
                referenceMonth: payment.referenceMonth,
                amountCents: payment.amountCents,
                receipt: !!stored,
                method: payment.method,
                isExtra: payment.isExtra,
              },
            },
            r,
          );
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
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "payment:write");
      const previous = await findPayment(contractId, paymentId);
      const stored = await storeReceipt(file);
      await repos.tx(async (r) => {
        await r.payments.setReceipt(paymentId, stored.name, stored.receipt);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: "payment.receipt",
            entity: "payment",
            entityId: paymentId,
          },
          r,
        );
      });
      if (previous.receiptFile) await discardFile(previous.receiptFile);
      return toPayment({ ...previous, receipt: stored.receipt, receiptFile: stored.name });
    },

    async openReceipt(
      actor: Actor,
      contractId: string,
      paymentId: string,
    ): Promise<ReceiptDownload> {
      await loadContract(deps, actor, contractId);
      requirePermission(actor, "receipt:read");
      const payment = await findPayment(contractId, paymentId);
      if (!payment.receipt || !payment.receiptFile)
        throw notFound("Este pagamento não tem comprovante");
      const stream = await files.open(payment.receiptFile);
      if (!stream) throw notFound("Comprovante indisponível");
      return {
        stream,
        mimeType: payment.receipt.mimeType,
        sizeBytes: payment.receipt.sizeBytes,
        filename: `comprovante-${payment.referenceMonth}.${EXTENSION[payment.receipt.mimeType]}`,
      };
    },

    async remove(actor: Actor, contractId: string, paymentId: string): Promise<void> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "payment:write");
      const payment = await findPayment(contractId, paymentId);
      await repos.tx(async (r) => {
        await r.payments.delete(paymentId);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: "payment.delete",
            entity: "payment",
            entityId: paymentId,
            meta: { referenceMonth: payment.referenceMonth, amountCents: payment.amountCents },
          },
          r,
        );
      });
      if (payment.receiptFile) await discardFile(payment.receiptFile);
    },

    async update(
      actor: Actor,
      contractId: string,
      paymentId: string,
      input: UpdatePaymentInput,
    ): Promise<Payment> {
      await loadWritableContract(deps, actor, contractId);
      requirePermission(actor, "payment:write");
      const current = await findPayment(contractId, paymentId);
      const next: PaymentRecord = {
        ...current,
        referenceMonth: input.referenceMonth ?? current.referenceMonth,
        paidOn: input.paidOn ?? current.paidOn,
        amountCents: input.amountCents ?? current.amountCents,
        method: input.method ?? current.method,
        note: input.note === undefined ? current.note : input.note || null,
        agreementId: input.agreementId === undefined ? current.agreementId : input.agreementId,
        isExtra: input.isExtra ?? current.isExtra,
      };
      const [issue] = paymentRuleIssues(next);
      if (issue) throw fieldError(issue.path, issue.message);

      const changed = EDITABLE_FIELDS.filter((k) => next[k] !== current[k]);
      const reopens =
        !!current.acknowledgedAt &&
        changed.some((k) => (MONEY_FIELDS as readonly string[]).includes(k));
      if (reopens) {
        next.acknowledgedAt = null;
        next.acknowledgedBy = null;
        next.acknowledgedByRole = null;
      }
      // While the payment stays on the same agreement, its remainingCents already counts it.
      const extraForAgreement =
        next.agreementId === current.agreementId
          ? next.amountCents - current.amountCents
          : next.amountCents;
      const agreementId = next.agreementId;
      const checkRoom = (r: TxRepos) =>
        agreementId && extraForAgreement > 0
          ? assertAgreementRoom(r, contractId, agreementId, extraForAgreement)
          : Promise.resolve();
      await checkRoom(repos);
      await repos.tx(async (r) => {
        await checkRoom(r);
        await r.payments.update(next);
        await audit(
          deps,
          {
            actorId: actor.id,
            contractId,
            action: "payment.update",
            entity: "payment",
            entityId: paymentId,
            meta: {
              changed,
              referenceMonth: next.referenceMonth,
              amountCents: next.amountCents,
              reopened: reopens,
            },
          },
          r,
        );
      });
      return toPayment(next);
    },

    /** The worker's "recebi". */
    acknowledge(actor: Actor, contractId: string, paymentId: string): Promise<Payment> {
      return markReceived(
        actor,
        contractId,
        paymentId,
        "payment:acknowledge",
        "payment.acknowledge",
      );
    },

    /** The employer closes the payment without waiting for the worker. */
    confirm(actor: Actor, contractId: string, paymentId: string): Promise<Payment> {
      return markReceived(actor, contractId, paymentId, "payment:confirm", "payment.confirm");
    },
  };
}
