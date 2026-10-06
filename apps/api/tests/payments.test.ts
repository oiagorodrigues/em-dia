import { readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { solidPng } from "../src/lib/png.ts";
import { setup, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let employer: TestUser;
let worker: TestUser;
let base: string;
const as = { type: "bearer" } as const;
const png = solidPng(4, 4, [35, 64, 232]);

beforeEach(async () => {
  t = setup();
  const pair = await t.linkedPair();
  employer = pair.employer;
  worker = pair.worker;
  base = `/api/v1/contracts/${pair.contractId}`;
});
afterEach(() => t.cleanup());

function createPayment(file?: { data: Buffer; name: string; type?: string }) {
  const req = t
    .http()
    .post(`${base}/payments`)
    .auth(employer.token, as)
    .field("referenceMonth", "2026-09")
    .field("paidOn", "2026-10-05")
    .field("amountCents", "54000")
    .field("method", "pix")
    .field("note", "setembro");
  return file
    ? req.attach("receipt", file.data, {
        filename: file.name,
        contentType: file.type ?? "image/png",
      })
    : req;
}

describe("create", () => {
  test("without receipt", async () => {
    const res = await createPayment();
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({
      amountCents: 54000,
      receipt: null,
      acknowledgedAt: null,
    });
  });

  test("accepts a real PNG, stores it under a random name and keeps a sanitised original name", async () => {
    const res = await createPayment({ data: png, name: "../../etc/<script>pix.png" });
    expect(res.status).toBe(201);
    expect(res.body.payment.receipt).toMatchObject({
      mimeType: "image/png",
      sizeBytes: png.length,
      originalName: "scriptpix.png",
    });
    expect(res.body.payment.receiptFile).toBeUndefined();
    const stored = readdirSync(t.uploadDir);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[a-f0-9]{32}\.png$/);
  });

  test("rejects a text file disguised as PNG with 415 and stores nothing", async () => {
    const res = await createPayment({
      data: Buffer.from("isto não é uma imagem"),
      name: "fake.png",
    });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA");
    expect(readdirSync(t.uploadDir)).toHaveLength(0);
  });

  test("rejects files over 5 MB with 413", async () => {
    const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await createPayment({ data: big, name: "big.png" });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("validates multipart fields", async () => {
    const res = await t
      .http()
      .post(`${base}/payments`)
      .auth(employer.token, as)
      .field("referenceMonth", "setembro");
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.referenceMonth).toBeDefined();
  });
});

describe("receipt download", () => {
  test("both parties can stream it with the contract headers", async () => {
    const created = await createPayment({ data: png, name: "pix.png" });
    const id = created.body.payment.id as string;
    for (const user of [employer, worker]) {
      const res = await t
        .http()
        .get(`${base}/payments/${id}/receipt`)
        .auth(user.token, as)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.headers["content-disposition"]).toBe('inline; filename="comprovante-2026-09.png"');
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(Buffer.compare(res.body as Buffer, png)).toBe(0);
    }
  });

  test("404 when the payment has no receipt", async () => {
    const created = await createPayment();
    const res = await t
      .http()
      .get(`${base}/payments/${created.body.payment.id}/receipt`)
      .auth(worker.token, as);
    expect(res.status).toBe(404);
  });

  test("replacing swaps the file; deleting the payment removes it", async () => {
    const created = await createPayment({ data: png, name: "a.png" });
    const id = created.body.payment.id as string;
    const before = readdirSync(t.uploadDir);

    const replaced = await t
      .http()
      .put(`${base}/payments/${id}/receipt`)
      .auth(employer.token, as)
      .attach("receipt", solidPng(2, 2, [0, 0, 0]), {
        filename: "b.png",
        contentType: "image/png",
      });
    expect(replaced.status).toBe(200);
    expect(replaced.body.payment.receipt.originalName).toBe("b.png");
    const after = readdirSync(t.uploadDir);
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before[0]);

    expect((await t.http().delete(`${base}/payments/${id}`).auth(employer.token, as)).status).toBe(
      204,
    );
    expect(readdirSync(t.uploadDir)).toHaveLength(0);
  });
});

describe("acknowledge and listing", () => {
  test("the worker acknowledges; the employer cannot", async () => {
    const created = await createPayment();
    const id = created.body.payment.id as string;
    expect(
      (await t.http().post(`${base}/payments/${id}/acknowledge`).auth(employer.token, as)).status,
    ).toBe(403);
    const ack = await t.http().post(`${base}/payments/${id}/acknowledge`).auth(worker.token, as);
    expect(ack.status).toBe(200);
    expect(ack.body.payment.acknowledgedAt).toBe("2026-10-06T15:00:00.000Z");
  });

  test("lists newest first and filters by year", async () => {
    await createPayment();
    const older = await t
      .http()
      .post(`${base}/payments`)
      .auth(employer.token, as)
      .send({ referenceMonth: "2025-12", paidOn: "2026-01-05", amountCents: 1000, method: "cash" });
    expect(older.status).toBe(201);

    const all = await t.http().get(`${base}/payments`).auth(worker.token, as);
    expect(all.body.payments.map((p: { paidOn: string }) => p.paidOn)).toEqual([
      "2026-10-05",
      "2026-01-05",
    ]);
    const y2025 = await t.http().get(`${base}/payments?year=2025`).auth(worker.token, as);
    expect(y2025.body.payments).toHaveLength(1);
  });
});
