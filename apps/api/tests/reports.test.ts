import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { setup, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let employer: TestUser;
let worker: TestUser;
let contractId: string;
let base: string;
const as = { type: "bearer" } as const;

beforeEach(async () => {
  t = setup();
  // Daily R$ 180 on Mon/Wed/Fri.
  const pair = await t.linkedPair({ schedule: { kind: "weekly", weekdays: [1, 3, 5] } });
  ({ employer, worker, contractId } = pair);
  base = `/api/v1/contracts/${contractId}`;
});
afterEach(() => t.cleanup());

async function put(user: TestUser, date: string, body: Record<string, unknown>) {
  const res = await t.http().put(`${base}/entries/${date}`).auth(user.token, as).send(body);
  expect(res.status).toBeLessThan(300);
}

describe("summary", () => {
  test("matches computeMonthSummary over entries, adjustments and payments", async () => {
    await put(worker, "2026-09-02", {
      status: "worked",
      checkIn: "08:00",
      checkOut: "16:00",
      breakMinutes: 60,
    });
    await put(worker, "2026-09-04", {
      status: "worked",
      checkIn: "08:00",
      checkOut: "17:00",
      breakMinutes: 60,
    });
    await put(employer, "2026-09-07", { status: "holiday", checkIn: null, checkOut: null });
    await put(employer, "2026-09-09", { status: "absent", checkIn: null, checkOut: null });
    await t.http().post(`${base}/entries/2026-09-02/confirm`).auth(employer.token, as);
    await t
      .http()
      .post(`${base}/adjustments`)
      .auth(employer.token, as)
      .send({ month: "2026-09", kind: "bonus", amountCents: 5000 });
    await t
      .http()
      .post(`${base}/adjustments`)
      .auth(employer.token, as)
      .send({ month: "2026-09", kind: "advance", amountCents: 10000 });
    await t
      .http()
      .post(`${base}/payments`)
      .auth(employer.token, as)
      .send({ referenceMonth: "2026-09", paidOn: "2026-09-30", amountCents: 20000, method: "pix" });

    const res = await t.http().get(`${base}/summary?month=2026-09`).auth(worker.token, as);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      month: "2026-09",
      daysWorked: 2,
      totalMinutes: 15 * 60,
      absences: 1,
      holidays: 1,
      expectedDays: 13,
      pendingConfirmation: 3,
      grossCents: 36000,
      adjustmentsCents: -5000,
      dueCents: 31000,
      paidCents: 20000,
      balanceCents: 11000,
      avgPerDayCents: 18000,
    });
    expect(res.body.summary.unrecordedDates).toHaveLength(9);
  });

  test("month query is required and validated", async () => {
    expect((await t.http().get(`${base}/summary`).auth(worker.token, as)).status).toBe(400);
    expect(
      (await t.http().get(`${base}/summary?month=2026-13`).auth(worker.token, as)).status,
    ).toBe(400);
  });
});

describe("statement.csv", () => {
  test("Excel pt-BR format with BOM, ';' and formula escaping", async () => {
    await put(worker, "2026-10-05", {
      status: "worked",
      checkIn: "08:00",
      checkOut: "16:00",
      breakMinutes: 60,
      note: '=HYPERLINK("http://evil";"x")',
    });
    await put(worker, "2026-10-02", {
      status: "absent",
      checkIn: null,
      checkOut: null,
      note: "@SUM(1)",
    });

    const res = await t
      .http()
      .get(`${base}/statement.csv?month=2026-10`)
      .auth(employer.token, as)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="extrato-2026-10.csv"');

    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split("\r\n");
    expect(lines[0]).toBe("Extrato;outubro 2026");
    expect(lines).toContain(
      `05/10/2026;seg;Sim;Trabalhou;08:00;16:00;60;7h;Não;"'=HYPERLINK(""http://evil"";""x"")"`,
    );
    expect(lines).toContain("02/10/2026;sex;Sim;Faltou;;;;;Não;'@SUM(1)");
    expect(lines).toContain("Valor bruto (R$);180,00");
    expect(lines).toContain("Combinado;seg, qua e sex");
    expect(lines).toContain("Desconto por faltas (R$);0,00");
    expect(lines).toContain("06/10/2026;ter;;;;;;;;");
    expect(lines).toContain("Dias previstos;13");
    expect(lines.filter((l) => /^\d{2}\/10\/2026;/.test(l))).toHaveLength(31);
  });
});

describe("activity", () => {
  test("records actions newest first with the actor's name", async () => {
    await put(worker, "2026-10-05", {
      status: "worked",
      checkIn: "08:00",
      checkOut: "16:00",
      breakMinutes: 0,
    });
    await t.http().post(`${base}/entries/2026-10-05/confirm`).auth(employer.token, as);

    const res = await t.http().get(`${base}/activity?limit=3`).auth(worker.token, as);
    expect(res.status).toBe(200);
    expect(res.body.activity.map((a: { action: string }) => a.action)).toEqual([
      "entry.confirm",
      "entry.create",
      "contract.join",
    ]);
    expect(res.body.activity[0]).toMatchObject({
      actorName: "Ana Contratante",
      entity: "entry",
      meta: { date: "2026-10-05" },
    });
  });
});

describe("dashboard", () => {
  test("one item per active contract with today's entry and the last payment", async () => {
    t.clock.set("2026-10-05T12:00:00.000Z");
    await t.reauth(worker);
    await t.reauth(employer);
    await t.http().post(`${base}/clock`).auth(worker.token, as).send({ action: "in" });
    await t
      .http()
      .post(`${base}/payments`)
      .auth(employer.token, as)
      .send({ referenceMonth: "2026-09", paidOn: "2026-10-01", amountCents: 1000, method: "cash" });
    const ended = await t.createContract(employer);
    await t
      .http()
      .post(`/api/v1/contracts/${ended.id}/end`)
      .auth(employer.token, as)
      .send({ endedOn: "2026-09-30" });

    const res = await t.http().get("/api/v1/dashboard").auth(employer.token, as);
    expect(res.body).toMatchObject({ month: "2026-10", today: "2026-10-05" });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].contract.id).toBe(contractId);
    expect(res.body.items[0].today).toMatchObject({ checkIn: "09:00" });
    expect(res.body.items[0].lastPayment).toMatchObject({ amountCents: 1000 });
    expect(res.body.items[0].summary.month).toBe("2026-10");

    const asWorker = await t.http().get("/api/v1/dashboard").auth(worker.token, as);
    expect(asWorker.body.items).toHaveLength(1);
  });
});
