import { monthQuerySchema } from "@emdia/shared";
import { Router } from "express";
import { z } from "zod";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { includeQuerySchema, parse } from "../validate.ts";

const teamQuerySchema = monthQuerySchema.partial().extend(includeQuerySchema.shape);
const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function reportRoutes({ reports }: Services): Router {
  const router = Router();

  router.get("/contracts/:id/summary", async (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json({ summary: await reports.summary(actorOf(res), req.params.id, month) });
  });

  router.get("/contracts/:id/statement.csv", async (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    const { filename, csv } = await reports.statement(actorOf(res), req.params.id, month);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(csv);
  });

  router.get("/contracts/:id/activity", async (req, res) => {
    const { limit } = parse(activityQuerySchema, req.query);
    res.json({ activity: await reports.activity(actorOf(res), req.params.id, limit) });
  });

  router.get("/team", async (req, res) => {
    const { month, include } = parse(teamQuerySchema, req.query);
    res.json(await reports.team(actorOf(res), month, include === "archived"));
  });

  router.get("/dashboard", async (req, res) => {
    const { month } = parse(monthQuerySchema.partial(), req.query);
    res.json(await reports.dashboard(actorOf(res), month));
  });

  return router;
}
