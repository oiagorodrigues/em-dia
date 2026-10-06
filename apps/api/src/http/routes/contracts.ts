import {
  createContractSchema,
  endContractSchema,
  joinContractSchema,
  updateContractSchema,
} from "@ponto/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { parse } from "../validate.ts";

export function contractRoutes({ contracts }: Services): Router {
  const router = Router();

  router.get("/contracts", (_req, res) => {
    res.json({ contracts: contracts.list(actorOf(res)) });
  });

  router.post("/contracts", (req, res) => {
    res
      .status(201)
      .json({ contract: contracts.create(actorOf(res), parse(createContractSchema, req.body)) });
  });

  router.post("/contracts/join", (req, res) => {
    res.json({ contract: contracts.join(actorOf(res), parse(joinContractSchema, req.body).code) });
  });

  router.get("/contracts/:id", (req, res) => {
    res.json({ contract: contracts.get(actorOf(res), req.params.id) });
  });

  router.patch("/contracts/:id", (req, res) => {
    res.json({
      contract: contracts.update(
        actorOf(res),
        req.params.id,
        parse(updateContractSchema, req.body),
      ),
    });
  });

  router.post("/contracts/:id/end", (req, res) => {
    const { endedOn } = parse(endContractSchema, req.body);
    res.json({ contract: contracts.end(actorOf(res), req.params.id, endedOn) });
  });

  router.post("/contracts/:id/invite", (req, res) => {
    res.json(contracts.invite(actorOf(res), req.params.id));
  });

  return router;
}
