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
  t = await setup();
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
    expect(ack.body.payment).toMatchObject({
      acknowledgedAt: "2026-10-06T15:00:00.000Z",
      acknowledgedBy: worker.user.id,
      acknowledgedByRole: "worker",
    });
  });

  test("the employer confirms without waiting; the worker cannot use that route; audited", async () => {
    const id = (await createPayment()).body.payment.id as string;
    expect(
      (await t.http().post(`${base}/payments/${id}/confirm`).auth(worker.token, as)).status,
    ).toBe(403);
    const res = await t.http().post(`${base}/payments/${id}/confirm`).auth(employer.token, as);
    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({
      acknowledgedAt: "2026-10-06T15:00:00.000Z",
      acknowledgedBy: employer.user.id,
      acknowledgedByRole: "employer",
    });
    // A later "recebi" keeps the first confirmation.
    const ack = await t.http().post(`${base}/payments/${id}/acknowledge`).auth(worker.token, as);
    expect(ack.body.payment.acknowledgedByRole).toBe("employer");
    const activity = await t.http().get(`${base}/activity`).auth(employer.token, as);
    expect(activity.body.activity.map((a: { action: string }) => a.action)).toContain(
      "payment.confirm",
    );
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

describe("edit", () => {
  test("the employer edits fields; changing the amount asks for the confirmation again", async () => {
    const id = (await createPayment()).body.payment.id as string;
    await t.http().post(`${base}/payments/${id}/acknowledge`).auth(worker.token, as);

    const noteOnly = await t
      .http()
      .patch(`${base}/payments/${id}`)
      .auth(employer.token, as)
      .send({ note: "salário de setembro" });
    expect(noteOnly.status).toBe(200);
    expect(noteOnly.body.payment).toMatchObject({
      note: "salário de setembro",
      acknowledgedByRole: "worker",
    });

    const amount = await t
      .http()
      .patch(`${base}/payments/${id}`)
      .auth(employer.token, as)
      .send({ amountCents: 50000, method: "cash" });
    expect(amount.status).toBe(200);
    expect(amount.body.payment).toMatchObject({
      amountCents: 50000,
      method: "cash",
      note: "salário de setembro",
      acknowledgedAt: null,
      acknowledgedBy: null,
    });

    const listed = await t.http().get(`${base}/payments`).auth(worker.token, as);
    expect(listed.body.payments[0]).toMatchObject({ id, amountCents: 50000 });
    const activity = await t.http().get(`${base}/activity`).auth(employer.token, as);
    expect(activity.body.activity[0]).toMatchObject({
      action: "payment.update",
      meta: { changed: ["amountCents", "method"], reopened: true },
    });
  });

  test("validates the merged payment and the role", async () => {
    const id = (await createPayment()).body.payment.id as string;
    const edit = (body: object, who = employer) =>
      t.http().patch(`${base}/payments/${id}`).auth(who.token, as).send(body);

    expect((await edit({ amountCents: 0 })).status).toBe(400);
    expect((await edit({})).status).toBe(400);
    const comp = await edit({ method: "compensation", note: null });
    expect(comp.status).toBe(400);
    expect(comp.body.error.details.fieldErrors.note).toBeDefined();
    expect((await edit({ note: "x" }, worker)).status).toBe(403);
    const missing = await t
      .http()
      .patch(`${base}/payments/nao-existe`)
      .auth(employer.token, as)
      .send({ note: "x" });
    expect(missing.status).toBe(404);
  });

  test("an installment can grow only up to what the agreement still owes", async () => {
    const agreement = await t.http().post(`${base}/agreements`).auth(employer.token, as).send({
      description: "mesa",
      totalCents: 30000,
      installmentCents: 10000,
      startMonth: "2026-10",
    });
    const agreementId = agreement.body.agreement.id as string;
    const paid = await t.http().post(`${base}/payments`).auth(employer.token, as).send({
      referenceMonth: "2026-10",
      paidOn: "2026-10-05",
      amountCents: 10000,
      method: "compensation",
      agreementId,
    });
    const id = paid.body.payment.id as string;
    const edit = (amountCents: number) =>
      t.http().patch(`${base}/payments/${id}`).auth(employer.token, as).send({ amountCents });

    expect((await edit(30000)).status).toBe(200);
    const over = await edit(30001);
    expect(over.status).toBe(400);
    expect(over.body.error.details.fieldErrors.amountCents).toBeDefined();
  });
});

const summaryOf = async (month: string) =>
  (await t.http().get(`${base}/summary?month=${month}`).auth(worker.token, as)).body.summary as {
    dueCents: number;
    paidCents: number;
    balanceCents: number;
    adjustmentsCents: number;
  };

const postJson = (body: Record<string, unknown>) =>
  t
    .http()
    .post(`${base}/payments`)
    .auth(employer.token, as)
    .send({ referenceMonth: "2026-09", paidOn: "2026-09-20", ...body });

describe("payment kinds", () => {
  test("gratificação and vale-transporte count as due and as paid, leaving the balance alone", async () => {
    const before = await summaryOf("2026-09");
    const bonus = await t
      .http()
      .post(`${base}/payments`)
      .auth(employer.token, as)
      .field("kind", "bonus")
      .field("referenceMonth", "2026-09")
      .field("paidOn", "2026-09-20")
      .field("amountCents", "10000")
      .field("method", "pix");
    expect(bonus.status).toBe(201);
    expect(bonus.body.payment).toMatchObject({ kind: "bonus", method: "pix" });
    const transport = await postJson({ kind: "transport", amountCents: 4400, method: "cash" });
    expect(transport.status).toBe(201);

    const after = await summaryOf("2026-09");
    expect(after.paidCents - before.paidCents).toBe(14400);
    expect(after.adjustmentsCents - before.adjustmentsCents).toBe(14400);
    expect(after.balanceCents).toBe(before.balanceCents);

    const list = await t.http().get(`${base}/payments?year=2026`).auth(worker.token, as);
    expect(list.body.payments.map((p: { kind: string }) => p.kind).sort()).toEqual([
      "bonus",
      "transport",
    ]);
  });

  test("a payment without kind is diárias/salário", async () => {
    const res = await createPayment();
    expect(res.body.payment).toMatchObject({ kind: "pay", advanceId: null, remainingCents: null });
  });

  test("a compensation only abates diárias/salário", async () => {
    const res = await postJson({
      kind: "bonus",
      amountCents: 1000,
      method: "compensation",
      note: "celular",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.kind).toBeDefined();
  });
});

describe("desconto", () => {
  test("only lowers what is due, with no method", async () => {
    const before = await summaryOf("2026-09");
    const res = await postJson({ kind: "deduction", amountCents: 5000, note: "Uniforme" });
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({ kind: "deduction", method: null });

    const after = await summaryOf("2026-09");
    expect(after.dueCents - before.dueCents).toBe(-5000);
    expect(after.paidCents).toBe(before.paidCents);
  });

  test("rejects a method and a receipt", async () => {
    const withMethod = await postJson({ kind: "deduction", amountCents: 5000, method: "pix" });
    expect(withMethod.status).toBe(400);
    expect(withMethod.body.error.details.fieldErrors.method).toBeDefined();

    const withReceipt = await t
      .http()
      .post(`${base}/payments`)
      .auth(employer.token, as)
      .field("kind", "deduction")
      .field("referenceMonth", "2026-09")
      .field("paidOn", "2026-09-20")
      .field("amountCents", "5000")
      .attach("receipt", png, { filename: "x.png", contentType: "image/png" });
    expect(withReceipt.status).toBe(400);
    expect(readdirSync(t.uploadDir)).toHaveLength(0);
  });

  test("has no recebi, no concluir and no receipt", async () => {
    const id = (await postJson({ kind: "deduction", amountCents: 5000 })).body.payment.id;
    const ack = await t.http().post(`${base}/payments/${id}/acknowledge`).auth(worker.token, as);
    expect(ack.status).toBe(409);
    const confirm = await t.http().post(`${base}/payments/${id}/confirm`).auth(employer.token, as);
    expect(confirm.status).toBe(409);
    const receipt = await t
      .http()
      .put(`${base}/payments/${id}/receipt`)
      .auth(employer.token, as)
      .attach("receipt", png, { filename: "x.png", contentType: "image/png" });
    expect(receipt.status).toBe(409);
  });

  test("an edit into a desconto drops the method and the confirmation", async () => {
    const paid = await postJson({ kind: "bonus", amountCents: 3000, method: "pix" });
    const id = paid.body.payment.id;
    await t.http().post(`${base}/payments/${id}/acknowledge`).auth(worker.token, as);
    const res = await t
      .http()
      .patch(`${base}/payments/${id}`)
      .auth(employer.token, as)
      .send({ kind: "deduction" });
    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({
      kind: "deduction",
      method: null,
      acknowledgedAt: null,
    });
  });
});

describe("adiantamentos", () => {
  const advance = (amountCents = 36000) =>
    postJson({
      kind: "advance",
      referenceMonth: "2026-09",
      paidOn: "2026-09-15",
      amountCents,
      method: "pix",
      note: "Vale",
    });
  const abate = (advanceId: string, amountCents: number, referenceMonth = "2026-10") =>
    postJson({
      referenceMonth,
      paidOn: "2026-10-02",
      amountCents,
      method: "compensation",
      advanceId,
    });
  const advances = async () =>
    (await t.http().get(`${base}/advances`).auth(worker.token, as)).body.advances as {
      id: string;
      settledCents: number;
      remainingCents: number;
    }[];

  test("change nothing when handed, and pay the days they abate", async () => {
    const before = await summaryOf("2026-09");
    const created = await advance();
    expect(created.status).toBe(201);
    expect(created.body.payment).toMatchObject({ settledCents: 0, remainingCents: 36000 });
    expect(await summaryOf("2026-09")).toEqual(before);

    const october = await summaryOf("2026-10");
    const abated = await abate(created.body.payment.id, 18000);
    expect(abated.status).toBe(201);
    expect(abated.body.payment).toMatchObject({
      kind: "pay",
      method: "compensation",
      advanceId: created.body.payment.id,
    });
    const after = await summaryOf("2026-10");
    expect(after.paidCents - october.paidCents).toBe(18000);
    expect(after.dueCents).toBe(october.dueCents);

    expect(await advances()).toMatchObject([{ settledCents: 18000, remainingCents: 18000 }]);

    const activity = await t.http().get(`${base}/activity`).auth(worker.token, as);
    const create = activity.body.activity.find(
      (a: { action: string; entityId: string }) =>
        a.action === "payment.create" && a.entityId === abated.body.payment.id,
    );
    expect(create.meta).toMatchObject({ advanceId: created.body.payment.id, kind: "pay" });
  });

  test("cannot abate more than what remains", async () => {
    const id = (await advance()).body.payment.id;
    await abate(id, 30000);
    const over = await abate(id, 6001);
    expect(over.status).toBe(400);
    expect(over.body.error.details.fieldErrors.amountCents[0]).toContain("R$");
    expect((await abate(id, 6000)).status).toBe(201);
    const full = await abate(id, 1);
    expect(full.body.error.details.fieldErrors.amountCents[0]).toBe(
      "Este adiantamento já foi todo abatido",
    );
  });

  test("an edit of an abatement respects what remains", async () => {
    const id = (await advance(20000)).body.payment.id;
    const abated = (await abate(id, 15000)).body.payment.id;
    const edit = (amountCents: number) =>
      t.http().patch(`${base}/payments/${abated}`).auth(employer.token, as).send({ amountCents });
    expect((await edit(20000)).status).toBe(200);
    expect((await edit(20001)).status).toBe(400);
  });

  test("abate only as compensation and only from an adiantamento of this contract", async () => {
    const id = (await advance()).body.payment.id;
    const pix = await postJson({ amountCents: 1000, method: "pix", advanceId: id });
    expect(pix.status).toBe(400);
    expect(pix.body.error.details.fieldErrors.method).toBeDefined();

    const plain = (await createPayment()).body.payment.id;
    const notAdvance = await abate(plain, 1000);
    expect(notAdvance.status).toBe(400);
    expect(notAdvance.body.error.details.fieldErrors.advanceId).toEqual([
      "Adiantamento não encontrado",
    ]);

    const other = await t.linkedPair();
    const foreign = await t
      .http()
      .post(`/api/v1/contracts/${other.contractId}/payments`)
      .auth(other.employer.token, as)
      .send({
        referenceMonth: "2026-10",
        paidOn: "2026-10-02",
        amountCents: 1000,
        method: "compensation",
        advanceId: id,
      });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.details.fieldErrors.advanceId).toBeDefined();
  });

  test("with abatements cannot be removed, retyped or shrunk below them", async () => {
    const id = (await advance()).body.payment.id;
    const abated = (await abate(id, 18000)).body.payment.id;
    const patch = (body: Record<string, unknown>) =>
      t.http().patch(`${base}/payments/${id}`).auth(employer.token, as).send(body);

    const removed = await t.http().delete(`${base}/payments/${id}`).auth(employer.token, as);
    expect(removed.status).toBe(409);
    expect((await patch({ kind: "pay" })).status).toBe(400);
    const shrink = await patch({ amountCents: 17999 });
    expect(shrink.status).toBe(400);
    expect(shrink.body.error.details.fieldErrors.amountCents).toBeDefined();
    const grow = await patch({ amountCents: 40000 });
    expect(grow.body.payment).toMatchObject({ remainingCents: 22000 });

    const undo = await t.http().delete(`${base}/payments/${abated}`).auth(employer.token, as);
    expect(undo.status).toBe(204);
    expect(await advances()).toMatchObject([{ settledCents: 0, remainingCents: 40000 }]);
    expect((await t.http().delete(`${base}/payments/${id}`).auth(employer.token, as)).status).toBe(
      204,
    );
  });

  test("the worker sees them, says recebi, and cannot write", async () => {
    const id = (await advance()).body.payment.id;
    expect(await advances()).toHaveLength(1);
    const ack = await t.http().post(`${base}/payments/${id}/acknowledge`).auth(worker.token, as);
    expect(ack.status).toBe(200);
    const write = await t.http().post(`${base}/payments`).auth(worker.token, as).send({
      referenceMonth: "2026-10",
      paidOn: "2026-10-02",
      amountCents: 1000,
      method: "compensation",
      advanceId: id,
    });
    expect(write.status).toBe(403);
  });

  test("are hidden from people outside the contract", async () => {
    const stranger = await t.register("employer");
    const res = await t.http().get(`${base}/advances`).auth(stranger.token, as);
    expect(res.status).toBe(404);
  });
});
