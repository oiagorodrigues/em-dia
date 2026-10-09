import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { setup, type TestEnv, type TestUser } from "./helpers.ts";

let t: TestEnv;
let user: TestUser;
const as = { type: "bearer" } as const;

beforeEach(async () => {
  t = await setup({ RATE_LIMIT_FEEDBACK: "3" });
  user = await t.register("employer", { name: "Ana Souza", email: "ana@test.dev" });
});
afterEach(() => {
  vi.restoreAllMocks();
  return t.cleanup();
});

const send = (body: object, who: TestUser | null = user) => {
  const req = t.http().post("/api/v1/feedback");
  return (who ? req.auth(who.token, as) : req).send(body);
};

describe("feedback", () => {
  test("mails the team with the user's e-mail as reply-to", async () => {
    const res = await send({
      kind: "problem",
      message: "O cartão não abre no celular",
      page: "/equipe/c1/cartao",
    });
    expect(res.status).toBe(204);
    const [mail] = t.mailer.outbox();
    expect(mail).toMatchObject({
      to: "yagomello16@gmail.com",
      replyTo: "ana@test.dev",
      subject: "em dia · problema de Ana Souza",
    });
    expect(mail!.text).toContain("O cartão não abre no celular");
    expect(mail!.text).toContain("De: Ana Souza <ana@test.dev> (contratante)");
    expect(mail!.text).toContain("Tela: /equipe/c1/cartao");
  });

  test("goes to FEEDBACK_TO when set", async () => {
    await t.cleanup();
    t = await setup({ FEEDBACK_TO: "time@test.dev" });
    user = await t.register("worker");
    expect((await send({ kind: "idea", message: "Modo escuro automático" })).status).toBe(204);
    expect(t.mailer.outbox()[0]?.to).toBe("time@test.dev");
  });

  test("needs a session and a message", async () => {
    expect((await send({ kind: "idea", message: "Oi, tudo bem?" }, null)).status).toBe(401);
    const short = await send({ kind: "idea", message: "oi" });
    expect(short.status).toBe(400);
    expect(short.body.error.details.fieldErrors.message).toEqual(["Conte um pouco mais"]);
    expect((await send({ kind: "bug", message: "Uma mensagem válida" })).status).toBe(400);
    expect(t.mailer.outbox()).toHaveLength(0);
  });

  test("says so when the mail can't go out", async () => {
    vi.spyOn(t.mailer, "send").mockRejectedValue(new Error("smtp down"));
    const res = await send({ kind: "other", message: "Uma mensagem qualquer" });
    expect(res.status).toBe(500);
    expect(res.body.error.message).toMatch(/Não deu para enviar/);
  });

  test("is rate limited", async () => {
    for (let i = 0; i < 3; i++)
      expect((await send({ kind: "idea", message: `Ideia número ${i}` })).status).toBe(204);
    expect((await send({ kind: "idea", message: "Mais uma ideia" })).status).toBe(429);
  });
});
