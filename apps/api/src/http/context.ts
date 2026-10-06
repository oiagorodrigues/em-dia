import type { Response } from "express";
import { AppError } from "../lib/errors.ts";
import type { Actor } from "../services/index.ts";

export function setActor(res: Response, actor: Actor): void {
  res.locals.actor = actor;
}

/** Only valid behind the `authenticate` middleware. */
export function actorOf(res: Response): Actor {
  const actor = res.locals.actor as Actor | undefined;
  if (!actor) throw new AppError("UNAUTHENTICATED", "Entre para continuar");
  return actor;
}

export function requestIdOf(res: Response): string {
  return String(res.locals.requestId ?? "");
}
