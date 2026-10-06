import { householdSchema } from "@ponto/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

export function householdRoutes({ households }: Services): Router {
  const router = Router();

  router.get("/households", (_req, res) => {
    res.json({ households: households.list(actorOf(res)) });
  });

  router.post("/households", (req, res) => {
    res
      .status(201)
      .json({ household: households.create(actorOf(res), parse(householdSchema, req.body)) });
  });

  router.patch("/households/:id", (req, res) => {
    res.json({
      household: households.update(actorOf(res), req.params.id, parse(householdSchema, req.body)),
    });
  });

  return router;
}
