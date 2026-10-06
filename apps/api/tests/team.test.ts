import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { loadConfig } from "../src/config/index.ts";
import { whatsappUrl } from "../src/services/invites.ts";
import { setup, type ContractOverrides, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let employer: TestUser;
const as = { type: "bearer" } as const;

beforeEach(async () => {
  t = await setup();
  employer = await t.register("employer", { name: "Ana Souza" });
});
afterEach(() => t.cleanup());

const BASE_CONTRACT = {
  workerName: "Joana",
  occupation: "baba",
  payType: "monthly",
  rateCents: 240000,
  schedule: { kind: "weekly", weekdays: [1, 2, 3, 4, 5] },
  expectedStart: "07:30",
  expectedEnd: "17:30",
  startedOn: "2026-08-03",
};

function create(env: TestEnv, user: TestUser, extra: ContractOverrides = {}) {
  return env
    .http()
    .post("/api/v1/contracts")
    .auth(user.token, as)
    .send({ ...BASE_CONTRACT, ...extra });
}

const decodedText = (url: string) => new URL(url).searchParams.get("text") ?? "";

describe("invite delivery on create", () => {
  test("no contacts: no invite", async () => {
    const res = await create(t, employer);
    expect(res.status).toBe(201);
    expect(res.body.invite).toBeNull();
    expect(res.body.contract).toMatchObject({
      contactEmail: null,
      contactPhone: null,
      archivedAt: null,
    });
  });

  test("with an e-mail: invite is created and e-mailed with code, link, employer and house", async () => {
    const res = await create(t, employer, { contactEmail: "Joana@Exemplo.com" });
    expect(res.status).toBe(201);
    const { contract, invite } = res.body;
    expect(contract.contactEmail).toBe("joana@exemplo.com");
    expect(invite).toMatchObject({ emailSent: true, whatsappUrl: null });
    expect(invite.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(invite.signupUrl).toBe(`http://localhost:5173/criar-conta?convite=${invite.code}`);

    const [mail] = t.mailer.outbox();
    expect(mail?.to).toBe("joana@exemplo.com");
    expect(mail?.subject).toBe("Ana Souza convidou você para o em dia");
    expect(mail?.text).toContain("Olá, Joana!");
    expect(mail?.text).toContain("Minha casa");
    expect(mail?.text).toContain(invite.signupUrl);
    expect(mail?.text).toContain(`código ${invite.code}`);
    expect(mail?.text).toContain("13/10/2026");

    const activity = await t
      .http()
      .get(`/api/v1/contracts/${contract.id}/activity`)
      .auth(employer.token, as);
    const sent = activity.body.activity.find(
      (a: { action: string }) => a.action === "contract.invite_sent",
    );
    expect(sent.meta).toEqual({ email: true });
    expect(JSON.stringify(activity.body)).not.toContain(invite.code);

    // The code works for signing up.
    const worker = await t.register("worker", { inviteCode: invite.code });
    const linked = await t.http().get(`/api/v1/contracts/${contract.id}`).auth(worker.token, as);
    expect(linked.status).toBe(200);
  });

  test("with a phone only: WhatsApp link, no e-mail", async () => {
    const res = await create(t, employer, { contactPhone: "(11) 98888-7777" });
    const { invite } = res.body;
    expect(invite.emailSent).toBe(false);
    expect(invite.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    const text = decodedText(invite.whatsappUrl);
    expect(text).toContain("Oi, Joana! Aqui é Ana Souza.");
    expect(text).toContain(invite.signupUrl);
    expect(t.mailer.outbox()).toHaveLength(0);
  });

  test("resending regenerates the code and e-mails again", async () => {
    const created = await create(t, employer, { contactEmail: "joana@exemplo.com" });
    const id = created.body.contract.id as string;
    const resend = await t.http().post(`/api/v1/contracts/${id}/invite`).auth(employer.token, as);
    expect(resend.status).toBe(200);
    expect(resend.body.invite.code).not.toBe(created.body.invite.code);
    expect(resend.body.invite.emailSent).toBe(true);
    expect(t.mailer.outbox()).toHaveLength(2);
    expect(t.mailer.outbox()[0]?.text).toContain(resend.body.invite.code);
  });

  test("PATCH changes or clears contacts and leaves them alone when omitted", async () => {
    const created = await create(t, employer, {
      contactEmail: "a@exemplo.com",
      contactPhone: "11988887777",
    });
    const id = created.body.contract.id as string;
    const patch = (body: object) =>
      t.http().patch(`/api/v1/contracts/${id}`).auth(employer.token, as).send(body);

    expect((await patch({ rateCents: 250000 })).body.contract).toMatchObject({
      contactEmail: "a@exemplo.com",
      contactPhone: "11988887777",
    });
    expect((await patch({ contactEmail: "", contactPhone: null })).body.contract).toMatchObject({
      contactEmail: null,
      contactPhone: null,
    });
    const resend = await t.http().post(`/api/v1/contracts/${id}/invite`).auth(employer.token, as);
    expect(resend.body.invite).toMatchObject({ emailSent: false, whatsappUrl: null });
  });

  test("validates contact fields", async () => {
    const bad = await create(t, employer, { contactEmail: "nope", contactPhone: "123" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fieldErrors.contactEmail).toBeDefined();
    expect(bad.body.error.details.fieldErrors.contactPhone).toBeDefined();
  });
});

describe("mail transport", () => {
  test("production without SMTP_URL reports emailSent=false", async () => {
    const prod = await setup({ NODE_ENV: "production" });
    const boss = await prod.register("employer");
    const res = await create(prod, boss, { contactEmail: "joana@exemplo.com" });
    await prod.cleanup();
    expect(res.status).toBe(201);
    expect(res.body.invite.emailSent).toBe(false);
  });

  test("an SMTP failure does not fail the request", async () => {
    const broken = await setup({ SMTP_URL: "smtp://127.0.0.1:1" });
    const boss = await broken.register("employer");
    const res = await create(broken, boss, { contactEmail: "joana@exemplo.com" });
    await broken.cleanup();
    expect(res.status).toBe(201);
    expect(res.body.invite.emailSent).toBe(false);
  });

  test("SMTP_URL must be an smtp(s) URL", () => {
    expect(() => loadConfig({ SMTP_URL: "http://mail" })).toThrow(/SMTP_URL/);
    expect(loadConfig({ SMTP_URL: "smtps://u:p@mail.example.com:465" }).smtpUrl).toMatch(/^smtps:/);
  });
});

describe("whatsappUrl", () => {
  test.each([
    ["(11) 98888-7777", "5511988887777"],
    ["11 3333-4444", "551133334444"],
    ["+55 (11) 98888-7777", "5511988887777"],
    ["55 11 3333-4444", "551133334444"],
    // DDD 55 (Santa Maria, RS) without the country code still gets it.
    ["(55) 99999-8888", "5555999998888"],
    ["(55) 3222-1111", "555532221111"],
  ])("%s → wa.me/%s", (phone, digits) => {
    const url = whatsappUrl(phone, "olá & até já?");
    expect(url).toBe(`https://wa.me/${digits}?text=${encodeURIComponent("olá & até já?")}`);
  });
});

describe("archive and restore", () => {
  test("DELETE archives: hidden by default, read-only, invite dropped; restore reopens", async () => {
    const created = await create(t, employer, { contactEmail: "joana@exemplo.com" });
    const id = created.body.contract.id as string;
    const code = created.body.invite.code as string;
    const base = `/api/v1/contracts/${id}`;
    await t.http().put(`${base}/entries/2026-10-05`).auth(employer.token, as).send({
      status: "worked",
      checkIn: "07:30",
      checkOut: "17:30",
      breakMinutes: 60,
    });

    expect((await t.http().delete(base).auth(employer.token, as)).status).toBe(204);
    expect((await t.http().delete(base).auth(employer.token, as)).status).toBe(204);

    const list = await t.http().get("/api/v1/contracts").auth(employer.token, as);
    expect(list.body.contracts).toEqual([]);
    const withArchived = await t
      .http()
      .get("/api/v1/contracts?include=archived")
      .auth(employer.token, as);
    expect(withArchived.body.contracts[0].archivedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(
      (await t.http().get(base).auth(employer.token, as)).body.contract.archivedAt,
    ).not.toBeNull();
    expect(
      (await t.http().get(`${base}/entries?month=2026-10`).auth(employer.token, as)).body.entries,
    ).toHaveLength(1);

    const writes = await Promise.all([
      t
        .http()
        .put(`${base}/entries/2026-10-06`)
        .auth(employer.token, as)
        .send({ status: "absent", checkIn: null, checkOut: null }),
      t.http().delete(`${base}/entries/2026-10-05`).auth(employer.token, as),
      t.http().post(`${base}/clock`).auth(employer.token, as).send({ action: "in" }),
      t
        .http()
        .post(`${base}/adjustments`)
        .auth(employer.token, as)
        .send({ month: "2026-10", kind: "bonus", amountCents: 100 }),
      t
        .http()
        .post(`${base}/payments`)
        .auth(employer.token, as)
        .send({ referenceMonth: "2026-10", paidOn: "2026-10-06", amountCents: 100, method: "pix" }),
      t.http().post(`${base}/invite`).auth(employer.token, as),
      t.http().patch(base).auth(employer.token, as).send({ rateCents: 1 }),
    ]);
    for (const res of writes) {
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: "CONFLICT",
        message: "Este vínculo foi removido",
      });
    }

    const worker = await t.register("worker");
    const join = await t
      .http()
      .post("/api/v1/contracts/join")
      .auth(worker.token, as)
      .send({ code });
    expect(join.status).toBe(404);

    const restored = await t.http().post(`${base}/restore`).auth(employer.token, as);
    expect(restored.body.contract.archivedAt).toBeNull();
    expect(
      (await t.http().get("/api/v1/contracts").auth(employer.token, as)).body.contracts,
    ).toHaveLength(1);
    // The old code stays dead after restoring; a new invite is needed.
    expect(
      (await t.http().post("/api/v1/contracts/join").auth(worker.token, as).send({ code })).status,
    ).toBe(404);
    expect(
      (await t.http().post(`${base}/clock`).auth(employer.token, as).send({ action: "in" })).status,
    ).toBe(200);

    const activity = await t.http().get(`${base}/activity`).auth(employer.token, as);
    const actions = activity.body.activity.map((a: { action: string }) => a.action);
    expect(actions).toContain("contract.archive");
    expect(actions).toContain("contract.restore");
  });

  test("the worker keeps read access but cannot write; only the employer archives", async () => {
    const { worker, employer: owner, contractId } = await t.linkedPair();
    const base = `/api/v1/contracts/${contractId}`;
    const payment = await t
      .http()
      .post(`${base}/payments`)
      .auth(owner.token, as)
      .send({ referenceMonth: "2026-09", paidOn: "2026-10-01", amountCents: 1000, method: "pix" });

    expect((await t.http().delete(base).auth(worker.token, as)).status).toBe(403);
    const stranger = await t.register("employer");
    expect((await t.http().delete(base).auth(stranger.token, as)).status).toBe(404);
    expect((await t.http().delete(base).auth(owner.token, as)).status).toBe(204);

    expect((await t.http().get("/api/v1/contracts").auth(worker.token, as)).body.contracts).toEqual(
      [],
    );
    const archived = await t
      .http()
      .get("/api/v1/contracts?include=archived")
      .auth(worker.token, as);
    expect(archived.body.contracts).toHaveLength(1);
    expect((await t.http().get(base).auth(worker.token, as)).status).toBe(200);
    expect(
      (await t.http().get(`${base}/summary?month=2026-09`).auth(worker.token, as)).status,
    ).toBe(200);
    expect(
      (await t.http().get(`${base}/payments`).auth(worker.token, as)).body.payments,
    ).toHaveLength(1);

    const write = await t
      .http()
      .put(`${base}/entries/2026-10-05`)
      .auth(worker.token, as)
      .send({ status: "absent", checkIn: null, checkOut: null });
    expect(write.status).toBe(409);
    const ack = await t
      .http()
      .post(`${base}/payments/${payment.body.payment.id}/acknowledge`)
      .auth(worker.token, as);
    expect(ack.status).toBe(409);
  });
});

describe("/team", () => {
  test("active and ended contracts with the month's numbers; archived only on request; dashboard excludes both", async () => {
    const active = (await create(t, employer)).body.contract.id as string;
    const ended = (await create(t, employer, { workerName: "Rosa" })).body.contract.id as string;
    const archived = (await create(t, employer, { workerName: "Carla" })).body.contract
      .id as string;
    await t
      .http()
      .post(`/api/v1/contracts/${ended}/end`)
      .auth(employer.token, as)
      .send({ endedOn: "2026-09-30" });
    await t.http().delete(`/api/v1/contracts/${archived}`).auth(employer.token, as);
    await t
      .http()
      .put(`/api/v1/contracts/${active}/entries/2026-09-16`)
      .auth(employer.token, as)
      .send({ status: "absent", checkIn: null, checkOut: null });

    const team = await t.http().get("/api/v1/team?month=2026-09").auth(employer.token, as);
    expect(team.status).toBe(200);
    expect(team.body).toMatchObject({ month: "2026-09", today: "2026-10-06" });
    const ids = team.body.items.map((i: { contract: { id: string } }) => i.contract.id);
    expect(ids.sort()).toEqual([active, ended].sort());
    const activeItem = team.body.items.find(
      (i: { contract: { id: string } }) => i.contract.id === active,
    );
    expect(activeItem.summary).toMatchObject({ month: "2026-09", absences: 1, expectedDays: 22 });

    const all = await t
      .http()
      .get("/api/v1/team?month=2026-09&include=archived")
      .auth(employer.token, as);
    expect(all.body.items).toHaveLength(3);

    const current = await t.http().get("/api/v1/team").auth(employer.token, as);
    expect(current.body.month).toBe("2026-10");

    const dashboard = await t.http().get("/api/v1/dashboard").auth(employer.token, as);
    expect(dashboard.body.items.map((i: { contract: { id: string } }) => i.contract.id)).toEqual([
      active,
    ]);

    expect(
      (await t.http().get("/api/v1/team?month=setembro").auth(employer.token, as)).status,
    ).toBe(400);
  });

  test("a worker sees their own contracts", async () => {
    const { worker, contractId } = await t.linkedPair();
    await t.linkedPair();
    const team = await t.http().get("/api/v1/team").auth(worker.token, as);
    expect(team.body.items.map((i: { contract: { id: string } }) => i.contract.id)).toEqual([
      contractId,
    ]);
  });
});
