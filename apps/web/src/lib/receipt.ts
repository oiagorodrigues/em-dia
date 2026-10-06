import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES, type ReceiptMimeType } from "@ponto/shared";

/** Client-side pre-check only; the API re-detects the type from magic bytes. */
export function receiptProblem(file: File): string | null {
  if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(file.type as ReceiptMimeType)) {
    return "Use uma foto (JPG, PNG, WebP) ou um PDF.";
  }
  if (file.size > RECEIPT_MAX_BYTES) return "O arquivo passa de 5 MB. Tente uma foto menor.";
  if (file.size === 0) return "O arquivo está vazio.";
  return null;
}
