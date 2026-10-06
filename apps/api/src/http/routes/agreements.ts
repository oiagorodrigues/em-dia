import { createAgreementSchema } from "@emdia/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

export function agreementRoutes({ agreements }: Services): Router {
  const router = Router();

  router.get("/contracts/:id/agreements", (req, res) => {
    res.json({ agreements: agreements.list(actorOf(res), req.params.id) });
  });

  router.post("/contracts/:id/agreements", (req, res) => {
    const input = parse(createAgreementSchema, req.body);
    res.status(201).json({ agreement: agreements.create(actorOf(res), req.params.id, input) });
  });

  router.post("/contracts/:id/agreements/:aid/accept", (req, res) => {
    res.json({ agreement: agreements.accept(actorOf(res), req.params.id, req.params.aid) });
  });

  router.post("/contracts/:id/agreements/:aid/cancel", (req, res) => {
    res.json({ agreement: agreements.cancel(actorOf(res), req.params.id, req.params.aid) });
  });

  return router;
}
