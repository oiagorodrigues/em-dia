import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { setup, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let employer: TestUser;
let worker: TestUser;
let contractId: string;
let base: string;
const as = { type: "bearer" } as const;

beforeEach(async () => {
  t = await setup();
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
  test("matches computeMonthSummary over entries and every payment kind", async () => {
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
    const pay = (body: Record<string, unknown>) =>
      t
        .http()
        .post(`${base}/payments`)
        .auth(employer.token, as)
        .send({ referenceMonth: "2026-09", paidOn: "2026-09-30", ...body });
    await pay({ kind: "bonus", amountCents: 5000, method: "cash" });
    await pay({ kind: "deduction", amountCents: 10000 });
    await pay({ kind: "advance", amountCents: 50000, method: "pix" });
    await pay({ amountCents: 20000, method: "pix" });

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
      // 08:00 to 16:00 less the break is the agreed 7h: the 8h day earns 8/7 of the diária.
      grossCents: 18000 + 20571,
      adjustmentsCents: -5000,
      dueCents: 33571,
      paidCents: 25000,
      balanceCents: 8571,
      avgPerDayCents: 19286,
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

describe("statement.pdf", () => {
  const pdf = (user: TestUser, query: string) =>
    t
      .http()
      .get(`${base}/statement.pdf${query}`)
      .auth(user.token, as)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });

  test("a PDF attachment for both roles", async () => {
    await put(worker, "2026-10-05", {
      status: "worked",
      checkIn: "08:00",
      checkOut: "16:00",
      breakMinutes: 60,
      note: "Limpeza da área de serviço 🙂",
    });
    await t
      .http()
      .post(`${base}/payments`)
      .auth(employer.token, as)
      .send({ referenceMonth: "2026-10", paidOn: "2026-10-06", amountCents: 18000, method: "pix" });

    for (const user of [employer, worker]) {
      const res = await pdf(user, "?month=2026-10");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["content-disposition"]).toBe('attachment; filename="extrato-2026-10.pdf"');
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const body = res.body as Buffer;
      expect(body.subarray(0, 4).toString()).toBe("%PDF");
      expect(body.subarray(-6).toString()).toContain("%%EOF");
    }
  });

  test("404 for a contract the caller can't see, 400 for a bad month", async () => {
    const other = await t.register("employer");
    expect((await pdf(other, "?month=2026-10")).status).toBe(404);
    expect((await pdf(employer, "?month=2026-13")).status).toBe(400);
    expect((await pdf(employer, "")).status).toBe(400);
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
