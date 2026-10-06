import type { ApiErrorBody } from "@emdia/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { AppError } from "../../lib/errors.ts";
import type { Logger } from "../../lib/logger.ts";
import { requestIdOf } from "../context.ts";

/** body-parser errors carry a `type`; anything else unexpected becomes a 500. */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    return err.code === "LIMIT_FILE_SIZE"
      ? new AppError("PAYLOAD_TOO_LARGE", "O comprovante deve ter no máximo 5 MB")
      : new AppError("VALIDATION", "Envio de arquivo inválido");
  }
  const type = (err as { type?: unknown } | null)?.type;
  if (type === "entity.too.large")
    return new AppError("PAYLOAD_TOO_LARGE", "Conteúdo grande demais");
  if (type === "entity.parse.failed") return new AppError("VALIDATION", "JSON inválido");
  if (typeof type === "string" && type.startsWith("encoding."))
    return new AppError("VALIDATION", "Codificação inválida");
  return new AppError("INTERNAL", "Algo deu errado do nosso lado. Tente de novo.");
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, next) => {
    const appError = toAppError(err);
    const requestId = requestIdOf(res);
    if (appError.status >= 500) logger.error("unhandled error", { requestId, err });
    if (res.headersSent) return next(err);
    const body: ApiErrorBody = { error: { code: appError.code, message: appError.message } };
    if (appError.details !== undefined) body.error.details = appError.details;
    res.status(appError.status).json(body);
  };
}

export const notFoundHandler: RequestHandler = () => {
  throw new AppError("NOT_FOUND", "Rota não encontrada");
};
