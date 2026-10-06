import {
  createContractSchema,
  endContractSchema,
  joinContractSchema,
  updateContractSchema,
} from "@emdia/shared";
import { Router } from "express";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { includeQuerySchema, parse } from "../validate.ts";

export function contractRoutes({ contracts }: Services): Router {
  const router = Router();

  router.get("/contracts", async (req, res) => {
    const { include } = parse(includeQuerySchema, req.query);
    res.json({ contracts: await contracts.list(actorOf(res), include === "archived") });
  });

  router.post("/contracts", async (req, res) => {
    const created = await contracts.create(actorOf(res), parse(createContractSchema, req.body));
    res.status(201).json(created);
  });

  router.post("/contracts/join", async (req, res) => {
    res.json({
      contract: await contracts.join(actorOf(res), parse(joinContractSchema, req.body).code),
    });
  });

  router.get("/contracts/:id", async (req, res) => {
    res.json({ contract: await contracts.get(actorOf(res), req.params.id) });
  });

  router.patch("/contracts/:id", async (req, res) => {
    res.json({
      contract: await contracts.update(
        actorOf(res),
        req.params.id,
        parse(updateContractSchema, req.body),
      ),
    });
  });

  router.post("/contracts/:id/end", async (req, res) => {
    const { endedOn } = parse(endContractSchema, req.body);
    res.json({ contract: await contracts.end(actorOf(res), req.params.id, endedOn) });
  });

  router.delete("/contracts/:id", async (req, res) => {
    await contracts.archive(actorOf(res), req.params.id);
    res.status(204).end();
  });

  router.post("/contracts/:id/restore", async (req, res) => {
    res.json({ contract: await contracts.restore(actorOf(res), req.params.id) });
  });

  router.post("/contracts/:id/invite", async (req, res) => {
    res.json({ invite: await contracts.invite(actorOf(res), req.params.id) });
  });

  return router;
}
