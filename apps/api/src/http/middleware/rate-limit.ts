import { rateLimit } from "express-rate-limit";
import type { ApiErrorBody } from "@emdia/shared";

const WINDOW_MS = 15 * 60 * 1000;

const body: ApiErrorBody = {
  error: {
    code: "RATE_LIMITED",
    message: "Muitas requisições. Aguarde alguns minutos e tente de novo.",
  },
};

export function createRateLimiter(limit: number) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: body,
  });
}
