import { monthQuerySchema } from "@emdia/shared";
import { Router } from "express";
import { z } from "zod";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function reportRoutes({ reports }: Services): Router {
  const router = Router();

  router.get("/contracts/:id/summary", (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json({ summary: reports.summary(actorOf(res), req.params.id, month) });
  });

  router.get("/contracts/:id/statement.csv", (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    const { filename, csv } = reports.statement(actorOf(res), req.params.id, month);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(csv);
  });

  router.get("/contracts/:id/activity", (req, res) => {
    const { limit } = parse(activityQuerySchema, req.query);
    res.json({ activity: reports.activity(actorOf(res), req.params.id, limit) });
  });

  router.get("/dashboard", (_req, res) => {
    res.json(reports.dashboard(actorOf(res)));
  });

  return router;
}
