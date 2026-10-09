import { feedbackSchema } from "@emdia/shared";
import { Router, type RequestHandler } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

export function feedbackRoutes(services: Services, limiter: RequestHandler): Router {
  const router = Router();

  router.post("/feedback", limiter, async (req, res) => {
    await services.feedback.send(actorOf(res), parse(feedbackSchema, req.body));
    res.status(204).end();
  });

  return router;
}
