import { updateMeSchema } from "@emdia/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

export function meRoutes(services: Services): Router {
  const router = Router();

  router.get("/me", (_req, res) => {
    res.json({ user: actorOf(res) });
  });

  router.patch("/me", (req, res) => {
    res.json({ user: services.me.update(actorOf(res), parse(updateMeSchema, req.body)) });
  });

  return router;
}
