import { createAdjustmentSchema, monthQuerySchema } from "@emdia/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

export function adjustmentRoutes({ adjustments }: Services): Router {
  const router = Router();

  router.get("/contracts/:id/adjustments", async (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json({ adjustments: await adjustments.list(actorOf(res), req.params.id, month) });
  });

  router.post("/contracts/:id/adjustments", async (req, res) => {
    const input = parse(createAdjustmentSchema, req.body);
    res
      .status(201)
      .json({ adjustment: await adjustments.create(actorOf(res), req.params.id, input) });
  });

  router.delete("/contracts/:id/adjustments/:adjId", async (req, res) => {
    await adjustments.remove(actorOf(res), req.params.id, req.params.adjId);
    res.status(204).end();
  });

  return router;
}
