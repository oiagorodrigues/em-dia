import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors.ts";
import type { Services } from "../../services/index.ts";
import { setActor } from "../context.ts";

export function authenticate(services: Services): RequestHandler {
  return async (req, res, next) => {
    const header = req.get("authorization");
    const match = header?.match(/^Bearer ([\w.-]+)$/);
    if (!match?.[1]) throw new AppError("UNAUTHENTICATED", "Entre para continuar");
    setActor(res, await services.auth.authenticate(match[1]));
    next();
  };
}

/**
 * Cookie-authenticated endpoints need a custom header: a cross-site form or
 * simple request cannot set it, which backs up SameSite=Strict.
 */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.get("x-requested-with") !== "ponto")
    throw new AppError("FORBIDDEN", "Requisição inválida");
  next();
};
