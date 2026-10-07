import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { PASSWORD, setup, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let employer: TestUser;
let worker: TestUser;
let contractId: string;
let base: string;
const as = { type: "bearer" } as const;
const CSRF = { "X-Requested-With": "emdia" };

beforeEach(async () => {
  t = await setup();
  ({ employer, worker, contractId } = await t.linkedPair());
  base = `/api/v1/contracts/${contractId}`;
});
afterEach(() => t.cleanup());

const MESA = {
  description: "Mesa de jantar",
  totalCents: 120000,
  installmentCents: 20000,
  startMonth: "2026-09",
};

async function createAgreement(body: object = MESA, user = employer, path = base) {
  return t.http().post(`${path}/agreements`).auth(user.token, as).send(body);
}

function pay(body: Record<string, unknown>, user = employer, path = base) {
  return t
    .http()
    .post(`${path}/payments`)
    .auth(user.token, as)
    .send({ referenceMonth: "2026-09", paidOn: "2026-10-02", method: "compensation", ...body });
}

describe("agreements", () => {
  test("employer creates, worker accepts, employer cancels; roles enforced; audited", async () => {
    const created = await createAgreement();
    expect(created.status).toBe(201);
    const agreement = created.body.agreement;
    expect(agreement).toMatchObject({
      ...MESA,
      settledCents: 0,
      remainingCents: 120000,
      acceptedAt: null,
      cancelledAt: null,
    });
    const id = agreement.id as string;

    expect((await createAgreement(MESA, worker)).status).toBe(403);
    expect(
      (await t.http().post(`${base}/agreements/${id}/accept`).auth(employer.token, as)).status,
    ).toBe(403);
    expect(
      (await t.http().post(`${base}/agreements/${id}/cancel`).auth(worker.token, as)).status,
    ).toBe(403);

    const accepted = await t.http().post(`${base}/agreements/${id}/accept`).auth(worker.token, as);
    expect(accepted.body.agreement.acceptedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(
      (await t.http().post(`${base}/agreements/${id}/accept`).auth(worker.token, as)).status,
    ).toBe(200);

    const list = await t.http().get(`${base}/agreements`).auth(worker.token, as);
    expect(list.body.agreements).toHaveLength(1);

    const cancelled = await t
      .http()
      .post(`${base}/agreements/${id}/cancel`)
      .auth(employer.token, as);
    expect(cancelled.body.agreement.cancelledAt).toBe("2026-10-06T15:00:00.000Z");
    expect(
      (await t.http().post(`${base}/agreements/${id}/accept`).auth(worker.token, as)).status,
    ).toBe(409);

    const activity = await t.http().get(`${base}/activity`).auth(employer.token, as);
    const actions = activity.body.activity.map((a: { action: string }) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["agreement.create", "agreement.accept", "agreement.cancel"]),
    );
  });

  test("validates the body", async () => {
    const res = await createAgreement({ ...MESA, installmentCents: 200000 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.installmentCents).toBeDefined();
    expect(
      (await t.http().post(`${base}/agreements/nope/accept`).auth(worker.token, as)).status,
    ).toBe(404);
  });

  test("other employers cannot see or touch it", async () => {
    await createAgreement();
    const stranger = await t.register("employer");
    expect((await t.http().get(`${base}/agreements`).auth(stranger.token, as)).status).toBe(404);
  });
});

describe("removing an agreement", () => {
  test("DELETE archives it and hides its installments; restore brings both back", async () => {
    const id = (await createAgreement()).body.agreement.id as string;
    const installment = await pay({ amountCents: 20000, agreementId: id });
    await pay({ amountCents: 30000, method: "pix", paidOn: "2026-10-04" });

    const url = `${base}/agreements/${id}`;
    expect((await t.http().delete(url).auth(worker.token, as)).status).toBe(403);
    expect((await t.http().delete(url).auth(employer.token, as)).status).toBe(204);
    expect((await t.http().delete(url).auth(employer.token, as)).status).toBe(204);

    const list = await t.http().get(`${base}/agreements`).auth(worker.token, as);
    expect(list.body.agreements).toHaveLength(0);
    const all = await t.http().get(`${base}/agreements?include=archived`).auth(worker.token, as);
    expect(all.body.agreements[0]).toMatchObject({
      id,
      archivedAt: "2026-10-06T15:00:00.000Z",
      settledCents: 20000,
    });

    const payments = await t.http().get(`${base}/payments`).auth(worker.token, as);
    expect(payments.body.payments.map((p: { method: string }) => p.method)).toEqual(["pix"]);
    const summary = await t.http().get(`${base}/summary?month=2026-09`).auth(worker.token, as);
    expect(summary.body.summary.paidCents).toBe(30000);
    expect(
      (
        await t
          .http()
          .post(`${base}/payments/${installment.body.payment.id}/acknowledge`)
          .auth(worker.token, as)
      ).status,
    ).toBe(404);
    expect((await t.http().post(`${url}/accept`).auth(worker.token, as)).status).toBe(404);
    const blocked = await pay({ amountCents: 100, agreementId: id });
    expect(blocked.body.error.details.fieldErrors.agreementId).toBeDefined();

    expect((await t.http().post(`${url}/restore`).auth(worker.token, as)).status).toBe(403);
    const restored = await t.http().post(`${url}/restore`).auth(employer.token, as);
    expect(restored.status).toBe(200);
    expect(restored.body.agreement).toMatchObject({ archivedAt: null, settledCents: 20000 });
    const back = await t.http().get(`${base}/summary?month=2026-09`).auth(worker.token, as);
    expect(back.body.summary.paidCents).toBe(50000);

    const activity = await t.http().get(`${base}/activity`).auth(employer.token, as);
    const actions = activity.body.activity.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["agreement.archive", "agreement.restore"]));
  });

  test("unknown or foreign agreements answer 404; archived contracts reject it", async () => {
    expect((await t.http().delete(`${base}/agreements/nope`).auth(employer.token, as)).status).toBe(
      404,
    );
    const id = (await createAgreement()).body.agreement.id as string;
    const stranger = await t.register("employer");
    expect(
      (await t.http().delete(`${base}/agreements/${id}`).auth(stranger.token, as)).status,
    ).toBe(404);
    await t.http().delete(base).auth(employer.token, as);
    expect(
      (await t.http().delete(`${base}/agreements/${id}`).auth(employer.token, as)).status,
    ).toBe(409);
  });
});

describe("compensation payments", () => {
  test("installments settle the agreement, count as paid and are acknowledged like any payment", async () => {
    const id = (await createAgreement()).body.agreement.id as string;
    const res = await pay({ amountCents: 20000, agreementId: id });
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({
      method: "compensation",
      agreementId: id,
      amountCents: 20000,
    });

    const list = await t.http().get(`${base}/agreements`).auth(employer.token, as);
    expect(list.body.agreements[0]).toMatchObject({ settledCents: 20000, remainingCents: 100000 });

    const summary = await t.http().get(`${base}/summary?month=2026-09`).auth(worker.token, as);
    expect(summary.body.summary.paidCents).toBe(20000);

    const ack = await t
      .http()
      .post(`${base}/payments/${res.body.payment.id}/acknowledge`)
      .auth(worker.token, as);
    expect(ack.body.payment.acknowledgedAt).not.toBeNull();
  });

  test("multipart forms can carry the agreement too", async () => {
    const id = (await createAgreement()).body.agreement.id as string;
    const res = await t
      .http()
      .post(`${base}/payments`)
      .auth(employer.token, as)
      .field("referenceMonth", "2026-09")
      .field("paidOn", "2026-10-02")
      .field("amountCents", "20000")
      .field("method", "compensation")
      .field("agreementId", id);
    expect(res.status).toBe(201);
    expect(res.body.payment.agreementId).toBe(id);
  });

  test("cannot exceed what remains, use a cancelled or foreign agreement, or mix with money", async () => {
    const id = (await createAgreement({ ...MESA, totalCents: 30000, installmentCents: null })).body
      .agreement.id as string;
    expect((await pay({ amountCents: 20000, agreementId: id })).status).toBe(201);

    const over = await pay({ amountCents: 15000, agreementId: id });
    expect(over.status).toBe(400);
    expect(over.body.error.details.fieldErrors.amountCents[0]).toContain("100,00");
    expect((await pay({ amountCents: 10000, agreementId: id })).status).toBe(201);
    expect((await pay({ amountCents: 1, agreementId: id })).status).toBe(400);

    const other = await t.linkedPair();
    const foreign = (
      await createAgreement(MESA, other.employer, `/api/v1/contracts/${other.contractId}`)
    ).body.agreement.id as string;
    const wrong = await pay({ amountCents: 100, agreementId: foreign });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.fieldErrors.agreementId).toBeDefined();

    const second = (await createAgreement()).body.agreement.id as string;
    await t.http().post(`${base}/agreements/${second}/cancel`).auth(employer.token, as);
    const cancelled = await pay({ amountCents: 100, agreementId: second });
    expect(cancelled.status).toBe(400);
    expect(cancelled.body.error.details.fieldErrors.agreementId).toBeDefined();

    const money = await pay({ amountCents: 100, agreementId: second, method: "pix" });
    expect(money.body.error.details.fieldErrors.method).toBeDefined();
  });

  test("a one-off compensation needs a note", async () => {
    const bare = await pay({ amountCents: 5000 });
    expect(bare.status).toBe(400);
    expect(bare.body.error.details.fieldErrors.note).toBeDefined();
    const withNote = await pay({ amountCents: 5000, note: "Ficou com a bicicleta" });
    expect(withNote.status).toBe(201);
    expect(withNote.body.payment.agreementId).toBeNull();
  });

  test("cancelling keeps the installments already paid", async () => {
    const id = (await createAgreement()).body.agreement.id as string;
    await pay({ amountCents: 20000, agreementId: id });
    const cancelled = await t
      .http()
      .post(`${base}/agreements/${id}/cancel`)
      .auth(employer.token, as);
    expect(cancelled.body.agreement).toMatchObject({ settledCents: 20000, remainingCents: 100000 });
    const payments = await t.http().get(`${base}/payments`).auth(employer.token, as);
    expect(payments.body.payments).toHaveLength(1);
  });

  test("the statement lists compensation with the agreement description", async () => {
    const id = (await createAgreement()).body.agreement.id as string;
    await pay({ amountCents: 20000, agreementId: id });
    await pay({ amountCents: 5000, note: "Ficou com a bicicleta", paidOn: "2026-10-03" });
    await pay({ amountCents: 30000, method: "pix", paidOn: "2026-10-04" });
    const csv = await t.http().get(`${base}/statement.csv?month=2026-09`).auth(employer.token, as);
    const lines = csv.text.split("\r\n");
    const start = lines.indexOf("Pagamentos");
    expect(lines.slice(start, start + 5)).toEqual([
      "Pagamentos",
      "Data;Tipo;Forma;Valor (R$);Recebido;Observação",
      "02/10/2026;Diárias/salário;Compensação: Mesa de jantar;200,00;Não;",
      "03/10/2026;Diárias/salário;Compensação;50,00;Não;Ficou com a bicicleta",
      "04/10/2026;Diárias/salário;Pix;300,00;Não;",
    ]);
  });

  test("the statement lists every kind, abatements with their adiantamento", async () => {
    const advance = await pay({
      kind: "advance",
      amountCents: 36000,
      method: "pix",
      paidOn: "2026-09-10",
    });
    await pay({ amountCents: 18000, advanceId: advance.body.payment.id, paidOn: "2026-09-12" });
    await pay({ kind: "deduction", method: undefined, amountCents: 5000, paidOn: "2026-09-13" });
    const csv = await t.http().get(`${base}/statement.csv?month=2026-09`).auth(employer.token, as);
    const lines = csv.text.split("\r\n");
    expect(lines).toContain("10/09/2026;Adiantamento;Pix;360,00;Não;");
    expect(lines).toContain(
      "12/09/2026;Diárias/salário;Compensação: adiantamento de 10/09/2026;180,00;Não;",
    );
    expect(lines).toContain("13/09/2026;Desconto;;50,00;;");
    expect(lines).toContain("Adiantamentos ainda a abater (R$);180,00");
  });

  test("archived contracts reject agreement writes", async () => {
    const id = (await createAgreement()).body.agreement.id as string;
    await t.http().delete(base).auth(employer.token, as);
    const writes = await Promise.all([
      createAgreement(),
      t.http().post(`${base}/agreements/${id}/accept`).auth(worker.token, as),
      t.http().post(`${base}/agreements/${id}/cancel`).auth(employer.token, as),
      pay({ amountCents: 100, agreementId: id }),
    ]);
    for (const res of writes) expect(res.status).toBe(409);
    expect(
      (await t.http().get(`${base}/agreements`).auth(worker.token, as)).body.agreements,
    ).toHaveLength(1);
  });
});

describe("DELETE /me", () => {
  const remove = (user: TestUser, body: object) =>
    t.http().delete("/api/v1/me").auth(user.token, as).set("Cookie", user.cookie).send(body);

  test("checks the password and the confirmation word", async () => {
    const wrong = await remove(employer, { password: "errada123456", confirm: "EXCLUIR" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.fieldErrors.password).toBeDefined();
    const unconfirmed = await remove(employer, { password: PASSWORD, confirm: "sim" });
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.error.details.fieldErrors.confirm).toBeDefined();
  });

  test("employer: contracts archived for the worker, sessions gone, e-mail free again", async () => {
    const email = employer.user.email;
    const res = await remove(employer, { password: PASSWORD, confirm: "EXCLUIR" });
    expect(res.status).toBe(204);
    expect(String(res.headers["set-cookie"])).toMatch(/emdia_rt=;/);

    expect((await t.http().get("/api/v1/me").auth(employer.token, as)).status).toBe(401);
    expect(
      (await t.http().post("/api/v1/auth/refresh").set(CSRF).set("Cookie", employer.cookie)).status,
    ).toBe(401);
    expect(
      (await t.http().post("/api/v1/auth/login").send({ email, password: PASSWORD })).status,
    ).toBe(401);

    const seen = await t.http().get(base).auth(worker.token, as);
    expect(seen.status).toBe(200);
    expect(seen.body.contract.archivedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(seen.body.contract.employerName).toBe("Conta excluída");

    const again = await t.register("employer", { email });
    expect(again.user.email).toBe(email);
    expect(
      (await t.http().get("/api/v1/contracts?include=archived").auth(again.token, as)).body
        .contracts,
    ).toEqual([]);
  });

  test("worker: unlinked from contracts, the employer keeps the records and can invite again", async () => {
    await t.http().put(`${base}/entries/2026-10-05`).auth(worker.token, as).send({
      status: "worked",
      checkIn: "08:00",
      checkOut: "16:00",
      breakMinutes: 60,
    });
    const res = await remove(worker, { password: PASSWORD, confirm: "EXCLUIR" });
    expect(res.status).toBe(204);

    const contract = (await t.http().get(base).auth(employer.token, as)).body.contract;
    expect(contract).toMatchObject({
      workerId: null,
      workerName: "Maria",
      archivedAt: null,
      workerPhone: null,
    });
    const entries = await t.http().get(`${base}/entries?month=2026-10`).auth(employer.token, as);
    expect(entries.body.entries).toHaveLength(1);

    const activity = await t.http().get(`${base}/activity`).auth(employer.token, as);
    expect(activity.body.activity[0]).toMatchObject({
      action: "contract.worker_left",
      actorName: "Conta excluída",
    });

    expect((await t.http().post(`${base}/invite`).auth(employer.token, as)).status).toBe(200);
    expect((await t.http().get(base).auth(worker.token, as)).status).toBe(401);
  });
});

describe("projections", () => {
  test("/dashboard and /team carry an estimate, also for future months", async () => {
    const monthly = await t.createContract(employer, { payType: "monthly", rateCents: 240000 });

    const nov = await t.http().get("/api/v1/dashboard?month=2026-11").auth(employer.token, as);
    expect(nov.status).toBe(200);
    expect(nov.body.month).toBe("2026-11");
    for (const item of nov.body.items) {
      expect(item.summary).toMatchObject({ month: "2026-11", daysWorked: 0, unrecordedDates: [] });
      expect(item.estimate.month).toBe("2026-11");
      expect(item.estimate.days).toBe(item.summary.expectedDays);
    }
    const daily = nov.body.items.find(
      (i: { contract: { id: string } }) => i.contract.id === contractId,
    );
    expect(daily.estimate).toMatchObject({
      minutesPerDay: 480,
      cents: daily.summary.expectedDays * 18000,
    });
    const fixed = nov.body.items.find(
      (i: { contract: { id: string } }) => i.contract.id === monthly.id,
    );
    expect(fixed.estimate.cents).toBe(240000);

    const team = await t.http().get("/api/v1/team?month=2027-01").auth(employer.token, as);
    expect(team.body.items[0].estimate.month).toBe("2027-01");

    const current = await t.http().get("/api/v1/dashboard").auth(employer.token, as);
    expect(current.body.month).toBe("2026-10");
    expect(
      (await t.http().get("/api/v1/dashboard?month=nov").auth(employer.token, as)).status,
    ).toBe(400);
  });

  test("on-demand schedules cannot be priced", async () => {
    const id = (await t.createContract(employer, { schedule: { kind: "on_demand" } })).id;
    const team = await t.http().get("/api/v1/team").auth(employer.token, as);
    const item = team.body.items.find((i: { contract: { id: string } }) => i.contract.id === id);
    expect(item.estimate.cents).toBeNull();
  });
});
