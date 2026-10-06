import { householdSchema } from "@emdia/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

export function householdRoutes({ households }: Services): Router {
  const router = Router();

  router.get("/households", async (_req, res) => {
    res.json({ households: await households.list(actorOf(res)) });
  });

  router.post("/households", async (req, res) => {
    res
      .status(201)
      .json({ household: await households.create(actorOf(res), parse(householdSchema, req.body)) });
  });

  router.patch("/households/:id", async (req, res) => {
    res.json({
      household: await households.update(
        actorOf(res),
        req.params.id,
        parse(householdSchema, req.body),
      ),
    });
  });

  return router;
}
