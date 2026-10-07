import { createAgreementSchema } from "@emdia/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { includeQuerySchema, parse } from "../validate.ts";

export function agreementRoutes({ agreements }: Services): Router {
  const router = Router();

  router.get("/contracts/:id/agreements", async (req, res) => {
    const { include } = parse(includeQuerySchema, req.query);
    res.json({
      agreements: await agreements.list(actorOf(res), req.params.id, include === "archived"),
    });
  });

  router.post("/contracts/:id/agreements", async (req, res) => {
    const input = parse(createAgreementSchema, req.body);
    res
      .status(201)
      .json({ agreement: await agreements.create(actorOf(res), req.params.id, input) });
  });

  router.post("/contracts/:id/agreements/:aid/accept", async (req, res) => {
    res.json({ agreement: await agreements.accept(actorOf(res), req.params.id, req.params.aid) });
  });

  router.post("/contracts/:id/agreements/:aid/cancel", async (req, res) => {
    res.json({ agreement: await agreements.cancel(actorOf(res), req.params.id, req.params.aid) });
  });

  router.delete("/contracts/:id/agreements/:aid", async (req, res) => {
    await agreements.archive(actorOf(res), req.params.id, req.params.aid);
    res.status(204).end();
  });

  router.post("/contracts/:id/agreements/:aid/restore", async (req, res) => {
    res.json({ agreement: await agreements.restore(actorOf(res), req.params.id, req.params.aid) });
  });

  return router;
}
