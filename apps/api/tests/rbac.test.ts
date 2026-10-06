import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { setup, type TestEnv } from "./helpers.ts";

let t: TestEnv;
beforeEach(() => {
  t = setup();
});
afterEach(() => t.cleanup());

describe("roles", () => {
  test("a worker cannot create contracts, adjustments or payments", async () => {
    const { worker, contractId } = await t.linkedPair();
    const asWorker = { type: "bearer" } as const;

    const contract = await t
      .http()
      .post("/api/v1/contracts")
      .auth(worker.token, asWorker)
      .send({
        workerName: "Eu",
        occupation: "diarista",
        payType: "daily",
        rateCents: 100,
        schedule: { kind: "weekly", weekdays: [1] },
        expectedStart: null,
        expectedEnd: null,
        startedOn: "2026-08-01",
      });
    expect(contract.status).toBe(403);
    expect(contract.body.error.code).toBe("FORBIDDEN");

    const payment = await t
      .http()
      .post(`/api/v1/contracts/${contractId}/payments`)
      .auth(worker.token, asWorker)
      .field("referenceMonth", "2026-09")
      .field("paidOn", "2026-10-01")
      .field("amountCents", "1000")
      .field("method", "pix");
    expect(payment.status).toBe(403);

    const adjustment = await t
      .http()
      .post(`/api/v1/contracts/${contractId}/adjustments`)
      .auth(worker.token, asWorker)
      .send({ month: "2026-09", kind: "bonus", amountCents: 1000 });
    expect(adjustment.status).toBe(403);

    expect(
      (
        await t
          .http()
          .patch(`/api/v1/contracts/${contractId}`)
          .auth(worker.token, asWorker)
          .send({})
      ).status,
    ).toBe(403);
    expect((await t.http().get("/api/v1/households").auth(worker.token, asWorker)).status).toBe(
      403,
    );
  });

  test("an employer cannot join a contract", async () => {
    const employer = await t.register("employer");
    const res = await t
      .http()
      .post("/api/v1/contracts/join")
      .auth(employer.token, { type: "bearer" })
      .send({ code: "ABCDEFGH" });
    expect(res.status).toBe(403);
  });
});

describe("ownership", () => {
  test("employer B gets 404 for every route under employer A's contract", async () => {
    const { contractId } = await t.linkedPair();
    const other = await t.register("employer");
    const as = { type: "bearer" } as const;
    const base = `/api/v1/contracts/${contractId}`;

    const responses = await Promise.all([
      t.http().get(base).auth(other.token, as),
      t.http().patch(base).auth(other.token, as).send({ rateCents: 1 }),
      t.http().post(`${base}/end`).auth(other.token, as).send({ endedOn: "2026-10-01" }),
      t.http().post(`${base}/invite`).auth(other.token, as),
      t.http().get(`${base}/entries?month=2026-10`).auth(other.token, as),
      t
        .http()
        .put(`${base}/entries/2026-10-05`)
        .auth(other.token, as)
        .send({ status: "absent", checkIn: null, checkOut: null }),
      t.http().get(`${base}/payments`).auth(other.token, as),
      t.http().get(`${base}/summary?month=2026-10`).auth(other.token, as),
      t.http().get(`${base}/statement.csv?month=2026-10`).auth(other.token, as),
      t.http().get(`${base}/activity`).auth(other.token, as),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }

    const list = await t.http().get("/api/v1/contracts").auth(other.token, as);
    expect(list.body.contracts).toEqual([]);
  });

  test("a worker only sees contracts they are linked to", async () => {
    const a = await t.linkedPair();
    const b = await t.linkedPair();
    const res = await t
      .http()
      .get(`/api/v1/contracts/${b.contractId}`)
      .auth(a.worker.token, { type: "bearer" });
    expect(res.status).toBe(404);
  });

  test("an employer cannot edit another employer's household or create a contract in it", async () => {
    const a = await t.register("employer");
    const b = await t.register("employer");
    const households = await t.http().get("/api/v1/households").auth(a.token, { type: "bearer" });
    const householdId = households.body.households[0].id as string;

    const patch = await t
      .http()
      .patch(`/api/v1/households/${householdId}`)
      .auth(b.token, { type: "bearer" })
      .send({ name: "Minha" });
    expect(patch.status).toBe(404);

    await expect(t.createContract(b, { householdId })).rejects.toThrow(/400/);
  });
});

describe("contracts and invites", () => {
  test("employer sees the linked worker's phone and pix key, live from their profile", async () => {
    const employer = await t.register("employer");
    const unlinked = await t.createContract(employer);
    expect(unlinked).toMatchObject({ workerPhone: null, workerPixKey: null });

    const { contractId, worker, employer: owner } = await t.linkedPair();
    const as = { type: "bearer" } as const;
    const read = async () =>
      (await t.http().get(`/api/v1/contracts/${contractId}`).auth(owner.token, as)).body.contract;
    expect(await read()).toMatchObject({ workerPhone: null, workerPixKey: null });

    const patch = await t
      .http()
      .patch("/api/v1/me")
      .auth(worker.token, as)
      .send({ phone: "(11) 91234-5678", pixKey: "maria@pix.dev" });
    expect(patch.status).toBe(200);
    expect(await read()).toMatchObject({
      workerPhone: "(11) 91234-5678",
      workerPixKey: "maria@pix.dev",
    });

    const list = await t.http().get("/api/v1/contracts").auth(owner.token, as);
    expect(list.body.contracts[0]).toMatchObject({ workerPixKey: "maria@pix.dev" });
    const dashboard = await t.http().get("/api/v1/dashboard").auth(owner.token, as);
    expect(dashboard.body.items[0].contract).toMatchObject({ workerPixKey: "maria@pix.dev" });

    await t.http().patch("/api/v1/me").auth(worker.token, as).send({ pixKey: null });
    expect(await read()).toMatchObject({ workerPhone: "(11) 91234-5678", workerPixKey: null });
  });

  test("employer creates, updates and ends a contract", async () => {
    const employer = await t.register("employer");
    const created = await t.createContract(employer, {
      schedule: { kind: "weekly", weekdays: [5, 1, 3, 1], monthDays: [5] },
    });
    const as = { type: "bearer" } as const;

    const updated = await t
      .http()
      .patch(`/api/v1/contracts/${created.id}`)
      .auth(employer.token, as)
      .send({ rateCents: 20000 });
    expect(updated.body.contract).toMatchObject({
      rateCents: 20000,
      schedule: {
        kind: "weekly",
        weekdays: [1, 3, 5],
        everyWeeks: 1,
        monthDays: [],
        visitsPerMonth: null,
      },
      employerName: "Ana Contratante",
    });

    const early = await t
      .http()
      .post(`/api/v1/contracts/${created.id}/end`)
      .auth(employer.token, as)
      .send({ endedOn: "2026-07-01" });
    expect(early.status).toBe(400);

    const ended = await t
      .http()
      .post(`/api/v1/contracts/${created.id}/end`)
      .auth(employer.token, as)
      .send({ endedOn: "2026-10-31" });
    expect(ended.body.contract).toMatchObject({ status: "ended", endedOn: "2026-10-31" });
  });

  test("invite codes: format, regeneration, expiry, single use, 409 once linked", async () => {
    const employer = await t.register("employer");
    const { id } = await t.createContract(employer);
    const as = { type: "bearer" } as const;
    const invite = () => t.http().post(`/api/v1/contracts/${id}/invite`).auth(employer.token, as);

    const first = await invite();
    expect(first.body.invite.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(first.body.invite.expiresAt).toBe("2026-10-13T15:00:00.000Z");

    const second = await invite();
    const worker = await t.register("worker");
    const join = (code: string) =>
      t.http().post("/api/v1/contracts/join").auth(worker.token, as).send({ code });

    expect((await join(first.body.invite.code)).status).toBe(404);
    t.clock.advance(8 * 24 * 60 * 60 * 1000);
    await t.reauth(worker);
    await t.reauth(employer);
    expect((await join(second.body.invite.code)).status).toBe(404);

    const third = await invite();
    const joined = await join(third.body.invite.code.toLowerCase());
    expect(joined.status).toBe(200);
    expect(joined.body.contract.workerId).toBe(worker.user.id);

    expect((await invite()).status).toBe(409);
  });
});
