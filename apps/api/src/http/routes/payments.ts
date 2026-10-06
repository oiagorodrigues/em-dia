import { createPaymentSchema, yearQuerySchema } from "@ponto/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.ts";
import type { Services } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { receiptUpload, uploadedFile } from "../middleware/upload.ts";
import { parse } from "../validate.ts";

export function paymentRoutes({ payments }: Services): Router {
  const router = Router();

  router.get("/contracts/:id/payments", (req, res) => {
    const { year } = parse(yearQuerySchema.partial(), req.query);
    res.json({ payments: payments.list(actorOf(res), req.params.id, year) });
  });

  router.post<{ id: string }>("/contracts/:id/payments", receiptUpload, async (req, res) => {
    const input = parse(createPaymentSchema, req.body);
    const payment = await payments.create(actorOf(res), req.params.id, input, uploadedFile(req));
    res.status(201).json({ payment });
  });

  router.put<{ id: string; pid: string }>(
    "/contracts/:id/payments/:pid/receipt",
    receiptUpload,
    async (req, res) => {
      const file = uploadedFile(req);
      if (!file) throw new AppError("VALIDATION", "Envie o arquivo do comprovante");
      res.json({
        payment: await payments.replaceReceipt(actorOf(res), req.params.id, req.params.pid, file),
      });
    },
  );

  router.get("/contracts/:id/payments/:pid/receipt", (req, res, next) => {
    const receipt = payments.openReceipt(actorOf(res), req.params.id, req.params.pid);
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

  router.post("/contracts/:id/payments/:pid/acknowledge", (req, res) => {
    res.json({ payment: payments.acknowledge(actorOf(res), req.params.id, req.params.pid) });
  });

  return router;
}
