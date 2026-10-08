import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { setup, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let employer: TestUser;
let worker: TestUser;
let base: string;
const as = { type: "bearer" } as const;

// Today in the helpers is Tuesday 2026-10-06. The plantão runs Friday 10-02 to Monday 10-05.
beforeEach(async () => {
  t = await setup();
  const pair = await t.linkedPair({
    payType: "shift",
    rateCents: 30000,
    schedule: { kind: "weekly", weekdays: [5] },
    expectedStart: "08:00",
    expectedEnd: "08:00",
  });
  employer = pair.employer;
  worker = pair.worker;
  base = `/api/v1/contracts/${pair.contractId}`;
});
afterEach(() => t.cleanup());

const put = (date: string, body: object, who = employer) =>
  t.http().put(`${base}/entries/${date}`).auth(who.token, as).send(body);
const stay = (checkOutDate: string | null, checkOut = "08:00") => ({
  status: "worked",
  checkIn: "08:00",
  checkOut,
  checkOutDate,
  breakMinutes: 0,
});

describe("plantão", () => {
  test("a contract starts with the adicional noturno on", async () => {
    const res = await t.http().get(base).auth(employer.token, as);
    expect(res.body.contract).toMatchObject({ payType: "shift", nightBonus: true });
  });

  test("one entry holds a Friday-to-Monday stay and is paid per 24h plus the night", async () => {
    const res = await put("2026-10-02", stay("2026-10-05"));
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ minutes: 72 * 60, checkOutDate: "2026-10-05" });

    const summary = await t.http().get(`${base}/summary?month=2026-10`).auth(employer.token, as);
    expect(summary.body.summary).toMatchObject({
      daysWorked: 1,
      totalMinutes: 72 * 60,
      grossCents: 90000,
      nightMinutes: 21 * 60,
      nightBonusCents: 5250,
      dueCents: 95250,
    });

    await t.http().patch(base).auth(employer.token, as).send({ nightBonus: false });
    const off = await t.http().get(`${base}/summary?month=2026-10`).auth(employer.token, as);
    expect(off.body.summary).toMatchObject({ nightBonusCents: 0, dueCents: 90000 });
  });

  test("days inside a stay can't hold their own entry", async () => {
    expect((await put("2026-10-02", stay("2026-10-05"))).status).toBe(201);
    const inside = await put("2026-10-03", stay(null, "17:00"));
    expect(inside.status).toBe(400);
    expect(inside.body.error.message).toMatch(/plantão de 02\/10\/2026/);
    // The check-out day starts a new day of its own.
    expect((await put("2026-10-05", stay(null, "17:00"))).status).toBe(201);

    expect((await put("2026-09-25", stay(null, "17:00"))).status).toBe(201);
    expect((await put("2026-09-28", stay(null, "17:00"))).status).toBe(201);
    const over = await put("2026-09-25", stay("2026-09-30"));
    expect(over.status).toBe(400);
    expect(over.body.error.details.fieldErrors.checkOutDate[0]).toMatch(/28\/09\/2026/);
  });

  test("the check-out date must come after the entry, within a week and not in the future", async () => {
    expect((await put("2026-10-02", stay("2026-10-02"))).status).toBe(400);
    expect((await put("2026-09-20", stay("2026-09-28"))).status).toBe(400);
    expect((await put("2026-10-05", stay("2026-10-07"))).status).toBe(400);
    expect((await put("2026-10-02", { ...stay("2026-10-04"), checkOut: null })).status).toBe(400);
  });

  test("clocking out on Monday closes the stay checked in on Friday", async () => {
    t.clock.set("2026-10-02T11:00:00.000Z"); // Friday 08:00 in São Paulo
    await t.reauth(worker);
    const clock = (action: "in" | "out") =>
      t.http().post(`${base}/clock`).auth(worker.token, as).send({ action });
    expect((await clock("in")).status).toBe(200);

    t.clock.set("2026-10-03T12:00:00.000Z"); // Saturday: the stay is still open
    await t.reauth(worker);
    expect((await clock("in")).status).toBe(409);

    t.clock.set("2026-10-05T11:00:00.000Z"); // Monday 08:00
    await t.reauth(worker);
    const out = await clock("out");
    expect(out.status).toBe(200);
    expect(out.body.entry).toMatchObject({
      date: "2026-10-02",
      checkOut: "08:00",
      checkOutDate: "2026-10-05",
      minutes: 72 * 60,
    });
  });
});
