import { createPaymentSchema, updatePaymentSchema, yearQuerySchema } from "@emdia/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.ts";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { receiptUpload, uploadedFile } from "../middleware/upload.ts";
import { parse } from "../validate.ts";

export function paymentRoutes({ payments }: Services, receiptMaxBytes: number): Router {
  const router = Router();
  const upload = receiptUpload(receiptMaxBytes);

  router.get("/contracts/:id/payments", async (req, res) => {
    const { year } = parse(yearQuerySchema.partial(), req.query);
    res.json({ payments: await payments.list(actorOf(res), req.params.id, year) });
  });

  router.get("/contracts/:id/advances", async (req, res) => {
    res.json({ advances: await payments.listAdvances(actorOf(res), req.params.id) });
  });

  router.post<{ id: string }>("/contracts/:id/payments", upload, async (req, res) => {
    const input = parse(createPaymentSchema, req.body);
    const payment = await payments.create(actorOf(res), req.params.id, input, uploadedFile(req));
    res.status(201).json({ payment });
  });

  router.put<{ id: string; pid: string }>(
    "/contracts/:id/payments/:pid/receipt",
    upload,
    async (req, res) => {
      const file = uploadedFile(req);
      if (!file) throw new AppError("VALIDATION", "Envie o arquivo do comprovante");
      res.json({
        payment: await payments.replaceReceipt(actorOf(res), req.params.id, req.params.pid, file),
      });
    },
  );

  router.get("/contracts/:id/payments/:pid/receipt", async (req, res, next) => {
    const receipt = await payments.openReceipt(actorOf(res), req.params.id, req.params.pid);
    res.setHeader("Content-Type", receipt.mimeType);
    res.setHeader("Content-Length", String(receipt.sizeBytes));
    res.setHeader("Content-Disposition", `inline; filename="${receipt.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    receipt.stream.on("error", next).pipe(res);
  });

  router.delete("/contracts/:id/payments/:pid", async (req, res) => {
    await payments.remove(actorOf(res), req.params.id, req.params.pid);
    res.status(204).end();
  });

  router.patch("/contracts/:id/payments/:pid", async (req, res) => {
    const input = parse(updatePaymentSchema, req.body);
    res.json({
      payment: await payments.update(actorOf(res), req.params.id, req.params.pid, input),
    });
  });

  router.post("/contracts/:id/payments/:pid/acknowledge", async (req, res) => {
    res.json({ payment: await payments.acknowledge(actorOf(res), req.params.id, req.params.pid) });
  });

  router.post("/contracts/:id/payments/:pid/confirm", async (req, res) => {
    res.json({ payment: await payments.confirm(actorOf(res), req.params.id, req.params.pid) });
  });

  return router;
}
