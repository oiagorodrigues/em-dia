import { clockSchema, isoDate, monthQuerySchema, upsertEntrySchema } from "@ponto/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

export function entryRoutes({ entries }: Services): Router {
  const router = Router();

  router.get("/contracts/:id/entries", (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json({ entries: entries.list(actorOf(res), req.params.id, month) });
  });

  router.put("/contracts/:id/entries/:date", (req, res) => {
    const date = parse(isoDate, req.params.date);
    const { entry, created } = entries.upsert(
      actorOf(res),
      req.params.id,
      date,
      parse(upsertEntrySchema, req.body),
    );
    res.status(created ? 201 : 200).json({ entry });
  });

  router.delete("/contracts/:id/entries/:date", (req, res) => {
    entries.remove(actorOf(res), req.params.id, parse(isoDate, req.params.date));
    res.status(204).end();
  });

  router.post("/contracts/:id/entries/:date/confirm", (req, res) => {
    res.json({
      entry: entries.confirm(actorOf(res), req.params.id, parse(isoDate, req.params.date)),
    });
  });

  router.post("/contracts/:id/clock", (req, res) => {
    const { action } = parse(clockSchema, req.body);
    res.json({ entry: entries.clock(actorOf(res), req.params.id, action) });
  });

  return router;
}
