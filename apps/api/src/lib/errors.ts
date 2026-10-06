export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "ACCOUNT_LOCKED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  ACCOUNT_LOCKED: 423,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  INTERNAL: 500,
};

/** `message` is pt-BR and shown to the user as is. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

/** Same shape as a zod flattened error so the web app renders it next to the field. */
export function fieldError(field: string, message: string): AppError {
  return new AppError("VALIDATION", message, {
    fieldErrors: { [field]: [message] },
    formErrors: [],
  });
}

export function formError(message: string): AppError {
  return new AppError("VALIDATION", message, { fieldErrors: {}, formErrors: [message] });
}

export const notFound = (message = "Não encontrado") => new AppError("NOT_FOUND", message);
export const forbidden = (message = "Você não tem permissão para isso") =>
  new AppError("FORBIDDEN", message);
