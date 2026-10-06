import { RECEIPT_MAX_BYTES } from "@emdia/shared";
import type { Request } from "express";
import multer from "multer";
import type { UploadedFile } from "../../services/index.ts";

/** Buffered in memory so the type can be checked from magic bytes before anything touches disk. */
export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECEIPT_MAX_BYTES, files: 1, fields: 10, fieldSize: 2048, parts: 12 },
}).single("receipt");

export function uploadedFile(req: Request): UploadedFile | undefined {
  return req.file ? { buffer: req.file.buffer, originalName: req.file.originalname } : undefined;
}
