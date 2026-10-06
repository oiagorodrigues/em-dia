import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { setup, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let employer: TestUser;
let worker: TestUser;
let base: string;
const as = { type: "bearer" } as const;

beforeEach(async () => {
  t = setup();
  const pair = await t.linkedPair({ payType: "hourly", rateCents: 3000 });
  employer = pair.employer;
  worker = pair.worker;
  base = `/api/v1/contracts/${pair.contractId}`;
});
afterEach(() => t.cleanup());

const worked = {
  status: "worked",
  checkIn: "08:00",
  checkOut: "16:30",
  breakMinutes: 30,
  note: "ok",
};

describe("upsert", () => {
  test("creates (201), derives minutes, then updates (200)", async () => {
    const created = await t
      .http()
      .put(`${base}/entries/2026-10-05`)
      .auth(worker.token, as)
      .send(worked);
    expect(created.status).toBe(201);
    expect(created.body.entry).toMatchObject({
      date: "2026-10-05",
      minutes: 480,
      createdBy: worker.user.id,
      createdByRole: "worker",
      confirmedAt: null,
    });

    const updated = await t
      .http()
      .put(`${base}/entries/2026-10-05`)
      .auth(worker.token, as)
      .send({ ...worked, checkOut: null });
    expect(updated.status).toBe(200);
    expect(updated.body.entry.minutes).toBe(0);
    expect(updated.body.entry.id).toBe(created.body.entry.id);

    const list = await t.http().get(`${base}/entries?month=2026-10`).auth(employer.token, as);
    expect(list.body.entries).toHaveLength(1);
  });

  test("rejects dates outside the contract and future worked days", async () => {
    const before = await t
      .http()
      .put(`${base}/entries/2026-07-31`)
      .auth(worker.token, as)
      .send(worked);
    expect(before.status).toBe(400);

    const future = await t
      .http()
      .put(`${base}/entries/2026-10-07`)
      .auth(worker.token, as)
      .send(worked);
    expect(future.status).toBe(400);

    const holiday = await t
      .http()
      .put(`${base}/entries/2026-10-12`)
      .auth(employer.token, as)
      .send({ status: "holiday", checkIn: null, checkOut: null });
    expect(holiday.status).toBe(201);
  });

  test("validates the body with the shared schema", async () => {
    const res = await t
      .http()
      .put(`${base}/entries/2026-10-05`)
      .auth(worker.token, as)
      .send({ status: "absent", checkIn: "08:00", checkOut: null });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.checkIn).toBeDefined();
    expect(
      (await t.http().put(`${base}/entries/2026-02-30`).auth(worker.token, as).send(worked)).status,
    ).toBe(400);
  });
});

describe("confirmation", () => {
  test("only the other party confirms; editing clears it", async () => {
    await t.http().put(`${base}/entries/2026-10-05`).auth(worker.token, as).send(worked);

    const self = await t.http().post(`${base}/entries/2026-10-05/confirm`).auth(worker.token, as);
    expect(self.status).toBe(403);

    const confirmed = await t
      .http()
      .post(`${base}/entries/2026-10-05/confirm`)
      .auth(employer.token, as);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.entry).toMatchObject({ confirmedBy: employer.user.id });
    expect(confirmed.body.entry.confirmedAt).toBeTypeOf("string");

    const edited = await t
      .http()
      .put(`${base}/entries/2026-10-05`)
      .auth(employer.token, as)
      .send({ ...worked, checkOut: "17:00" });
    expect(edited.body.entry).toMatchObject({
      confirmedAt: null,
      confirmedBy: null,
      createdBy: employer.user.id,
    });

    // The employer's edit now needs the worker's confirmation.
    expect(
      (await t.http().post(`${base}/entries/2026-10-05/confirm`).auth(employer.token, as)).status,
    ).toBe(403);
    expect(
      (await t.http().post(`${base}/entries/2026-10-05/confirm`).auth(worker.token, as)).status,
    ).toBe(200);
  });

  test("confirming a missing entry is 404", async () => {
    expect(
      (await t.http().post(`${base}/entries/2026-10-01/confirm`).auth(employer.token, as)).status,
    ).toBe(404);
  });
});

describe("delete", () => {
  test("worker deletes own unconfirmed entry only; employer can always delete", async () => {
    await t.http().put(`${base}/entries/2026-10-05`).auth(employer.token, as).send(worked);
    expect(
      (await t.http().delete(`${base}/entries/2026-10-05`).auth(worker.token, as)).status,
    ).toBe(403);

    await t.http().put(`${base}/entries/2026-10-02`).auth(worker.token, as).send(worked);
    await t.http().post(`${base}/entries/2026-10-02/confirm`).auth(employer.token, as);
    expect(
      (await t.http().delete(`${base}/entries/2026-10-02`).auth(worker.token, as)).status,
    ).toBe(403);
    expect(
      (await t.http().delete(`${base}/entries/2026-10-02`).auth(employer.token, as)).status,
    ).toBe(204);

    await t.http().put(`${base}/entries/2026-10-01`).auth(worker.token, as).send(worked);
    expect(
      (await t.http().delete(`${base}/entries/2026-10-01`).auth(worker.token, as)).status,
    ).toBe(204);
  });
});

describe("clock", () => {
  test("in then out uses the household timezone", async () => {
    t.clock.set("2026-10-06T11:02:00.000Z"); // 08:02 in São Paulo
    await t.reauth(worker);
    const clockIn = await t
      .http()
      .post(`${base}/clock`)
      .auth(worker.token, as)
      .send({ action: "in" });
    expect(clockIn.status).toBe(200);
    expect(clockIn.body.entry).toMatchObject({
      date: "2026-10-06",
      status: "worked",
      checkIn: "08:02",
      checkOut: null,
    });

    expect(
      (await t.http().post(`${base}/clock`).auth(worker.token, as).send({ action: "in" })).status,
    ).toBe(409);

    t.clock.set("2026-10-06T19:32:00.000Z"); // 16:32
    await t.reauth(worker);
    const clockOut = await t
      .http()
      .post(`${base}/clock`)
      .auth(worker.token, as)
      .send({ action: "out" });
    expect(clockOut.body.entry).toMatchObject({ checkOut: "16:32", minutes: 510 });

    expect(
      (await t.http().post(`${base}/clock`).auth(worker.token, as).send({ action: "out" })).status,
    ).toBe(409);
  });

  test("late UTC evening still counts as the local day", async () => {
    t.clock.set("2026-10-07T02:30:00.000Z"); // 23:30 on the 6th in São Paulo
    await t.reauth(worker);
    const res = await t.http().post(`${base}/clock`).auth(worker.token, as).send({ action: "in" });
    expect(res.body.entry.date).toBe("2026-10-06");
  });

  test("out without in is 409", async () => {
    expect(
      (await t.http().post(`${base}/clock`).auth(worker.token, as).send({ action: "out" })).status,
    ).toBe(409);
  });
});
