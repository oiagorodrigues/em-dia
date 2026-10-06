import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { PASSWORD, refreshCookie, setup, type TestEnv } from "./helpers.ts";

let t: TestEnv;
beforeEach(() => {
  t = setup();
});
afterEach(() => t.cleanup());

const CSRF = { "X-Requested-With": "emdia" };

describe("register", () => {
  test("employer gets a household and a refresh cookie with the contract attributes", async () => {
    const res = await t
      .http()
      .post("/api/v1/auth/register")
      .send({ name: "Ana", email: "ANA@Test.dev ", password: PASSWORD, role: "employer" });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "ana@test.dev", role: "employer" });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0] ?? "";
    expect(cookie).toMatch(/^emdia_rt=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

    const households = await t
      .http()
      .get("/api/v1/households")
      .auth(res.body.accessToken, { type: "bearer" });
    expect(households.body.households).toHaveLength(1);
    expect(households.body.households[0]).toMatchObject({
      name: "Minha casa",
      timezone: "America/Sao_Paulo",
    });
  });

  test("duplicate e-mail is 409", async () => {
    await t.register("employer", { email: "dup@test.dev" });
    const res = await t
      .http()
      .post("/api/v1/auth/register")
      .send({ name: "Outra", email: "dup@test.dev", password: PASSWORD, role: "worker" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  test("weak password fails validation with field errors", async () => {
    const res = await t
      .http()
      .post("/api/v1/auth/register")
      .send({ name: "Ana", email: "a@test.dev", password: "curta", role: "employer" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.details.fieldErrors.password).toBeDefined();
  });

  test("worker with a valid invite code is linked; an invalid code is rejected", async () => {
    const { worker, contractId } = await t.linkedPair();
    const contracts = await t
      .http()
      .get("/api/v1/contracts")
      .auth(worker.token, { type: "bearer" });
    expect(contracts.body.contracts.map((c: { id: string }) => c.id)).toEqual([contractId]);

    const bad = await t.http().post("/api/v1/auth/register").send({
      name: "Joana",
      email: "j@test.dev",
      password: PASSWORD,
      role: "worker",
      inviteCode: "AAAAAAAA",
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fieldErrors.inviteCode).toBeDefined();
  });
});

describe("login and lockout", () => {
  test("wrong password and unknown e-mail get the same 401", async () => {
    await t.register("employer", { email: "ana@test.dev" });
    const wrong = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: "ana@test.dev", password: "errada123456" });
    const unknown = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: "x@test.dev", password: "errada123456" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  test("5 failures lock the account for 15 minutes", async () => {
    await t.register("employer", { email: "ana@test.dev" });
    const attempt = (password: string) =>
      t.http().post("/api/v1/auth/login").send({ email: "ana@test.dev", password });
    for (let i = 0; i < 4; i++) expect((await attempt("errada123456")).status).toBe(401);
    const fifth = await attempt("errada123456");
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");
    expect((await attempt(PASSWORD)).status).toBe(423);

    t.clock.advance(15 * 60 * 1000 + 1000);
    const ok = await attempt(PASSWORD);
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTypeOf("string");
  });

  test("a successful login resets the failure count", async () => {
    await t.register("employer", { email: "ana@test.dev" });
    const attempt = (password: string) =>
      t.http().post("/api/v1/auth/login").send({ email: "ana@test.dev", password });
    for (let i = 0; i < 4; i++) await attempt("errada123456");
    expect((await attempt(PASSWORD)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await attempt("errada123456")).status).toBe(401);
  });
});

describe("access token", () => {
  test("missing, malformed and expired tokens", async () => {
    const user = await t.register("employer");
    expect((await t.http().get("/api/v1/me")).status).toBe(401);
    expect(
      (await t.http().get("/api/v1/me").auth("garbage", { type: "bearer" })).body.error.code,
    ).toBe("UNAUTHENTICATED");
    t.clock.advance(16 * 60 * 1000);
    const expired = await t.http().get("/api/v1/me").auth(user.token, { type: "bearer" });
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("TOKEN_EXPIRED");
  });

  test("a token signed with another secret is rejected", async () => {
    const other = setup({ JWT_SECRET: "another-secret-that-is-long-enough-987654" });
    const foreign = await other.register("employer");
    other.cleanup();
    await t.register("employer");
    expect((await t.http().get("/api/v1/me").auth(foreign.token, { type: "bearer" })).status).toBe(
      401,
    );
  });
});

describe("refresh", () => {
  test("requires the X-Requested-With header", async () => {
    const user = await t.register("employer");
    const res = await t.http().post("/api/v1/auth/refresh").set("Cookie", user.cookie);
    expect(res.status).toBe(403);
  });

  test("401 without a cookie", async () => {
    const res = await t.http().post("/api/v1/auth/refresh").set(CSRF);
    expect(res.status).toBe(401);
  });

  const GRACE_MS = 20_000;
  const refresh = (cookie: string) =>
    t.http().post("/api/v1/auth/refresh").set(CSRF).set("Cookie", cookie);

  test("rotates the token; reusing the old one after the grace window revokes the whole family", async () => {
    const user = await t.register("employer");
    const first = await refresh(user.cookie);
    expect(first.status).toBe(200);
    expect(first.body.user.id).toBe(user.user.id);
    const rotated = refreshCookie(first);
    expect(rotated).not.toBe(user.cookie);

    t.clock.advance(GRACE_MS + 1000);
    expect((await refresh(user.cookie)).status).toBe(401);

    // The legitimate holder of the rotated token is logged out too.
    expect((await refresh(rotated)).status).toBe(401);
  });

  test("replaying a just-rotated token inside the grace window gets a fresh token in the same family", async () => {
    const user = await t.register("employer");
    const first = await refresh(user.cookie);
    const rotated = refreshCookie(first);

    t.clock.advance(GRACE_MS - 5000);
    const replay = await refresh(user.cookie);
    expect(replay.status).toBe(200);
    const replayed = refreshCookie(replay);
    expect(replayed).not.toBe(rotated);

    // Both branches stay usable, and the family is still policed afterwards.
    expect((await refresh(rotated)).status).toBe(200);
    expect((await refresh(replayed)).status).toBe(200);
    t.clock.advance(GRACE_MS + 1000);
    expect((await refresh(rotated)).status).toBe(401);
    expect((await refresh(replayed)).status).toBe(401);
  });

  test("no grace after logout, even inside the window", async () => {
    const user = await t.register("employer");
    const rotated = refreshCookie(await refresh(user.cookie));
    expect(
      (await t.http().post("/api/v1/auth/logout").set(CSRF).set("Cookie", rotated)).status,
    ).toBe(204);
    expect((await refresh(user.cookie)).status).toBe(401);
    expect((await refresh(rotated)).status).toBe(401);
  });

  test("no grace after a password change", async () => {
    const user = await t.register("employer");
    const rotated = refreshCookie(await refresh(user.cookie));
    const changed = await t
      .http()
      .post("/api/v1/me/password")
      .auth(user.token, { type: "bearer" })
      .send({ currentPassword: PASSWORD, newPassword: "nova-senha-456" });
    expect(changed.status).toBe(200);
    expect((await refresh(user.cookie)).status).toBe(401);
    expect((await refresh(rotated)).status).toBe(401);
  });

  test("other sessions survive a reuse in one family", async () => {
    const user = await t.register("employer", { email: "ana@test.dev" });
    const login = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: "ana@test.dev", password: PASSWORD });
    const otherDevice = refreshCookie(login);
    await refresh(user.cookie);
    t.clock.advance(GRACE_MS + 1000);
    expect((await refresh(user.cookie)).status).toBe(401);
    expect((await refresh(otherDevice)).status).toBe(200);
  });

  test("refresh tokens expire after 30 days", async () => {
    const user = await t.register("employer");
    t.clock.advance(31 * 24 * 60 * 60 * 1000);
    expect(
      (await t.http().post("/api/v1/auth/refresh").set(CSRF).set("Cookie", user.cookie)).status,
    ).toBe(401);
  });
});

describe("logout", () => {
  test("requires the CSRF header, revokes the family and clears the cookie", async () => {
    const user = await t.register("employer");
    expect((await t.http().post("/api/v1/auth/logout").set("Cookie", user.cookie)).status).toBe(
      403,
    );
    const res = await t.http().post("/api/v1/auth/logout").set(CSRF).set("Cookie", user.cookie);
    expect(res.status).toBe(204);
    expect(String(res.headers["set-cookie"])).toMatch(/emdia_rt=;/);
    expect(
      (await t.http().post("/api/v1/auth/refresh").set(CSRF).set("Cookie", user.cookie)).status,
    ).toBe(401);
  });

  test("logout-all kills access tokens and every refresh token", async () => {
    const user = await t.register("employer", { email: "ana@test.dev" });
    const login = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: "ana@test.dev", password: PASSWORD });
    expect(
      (await t.http().post("/api/v1/auth/logout-all").auth(user.token, { type: "bearer" })).status,
    ).toBe(204);
    expect(
      (await t.http().get("/api/v1/me").auth(login.body.accessToken, { type: "bearer" })).status,
    ).toBe(401);
    expect(
      (await t.http().post("/api/v1/auth/refresh").set(CSRF).set("Cookie", refreshCookie(login)))
        .status,
    ).toBe(401);
  });
});

describe("password change and reset", () => {
  test("changing the password bumps the token version and revokes other sessions", async () => {
    const user = await t.register("employer", { email: "ana@test.dev" });
    const wrong = await t
      .http()
      .post("/api/v1/me/password")
      .auth(user.token, { type: "bearer" })
      .send({ currentPassword: "errada123456", newPassword: "nova-senha-456" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.fieldErrors.currentPassword).toBeDefined();

    const res = await t
      .http()
      .post("/api/v1/me/password")
      .auth(user.token, { type: "bearer" })
      .send({ currentPassword: PASSWORD, newPassword: "nova-senha-456" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf("string");

    expect((await t.http().get("/api/v1/me").auth(user.token, { type: "bearer" })).status).toBe(
      401,
    );
    expect(
      (await t.http().get("/api/v1/me").auth(res.body.accessToken, { type: "bearer" })).status,
    ).toBe(200);
    expect(
      (await t.http().post("/api/v1/auth/refresh").set(CSRF).set("Cookie", user.cookie)).status,
    ).toBe(401);
    expect(
      (await t.http().post("/api/v1/auth/refresh").set(CSRF).set("Cookie", refreshCookie(res)))
        .status,
    ).toBe(200);

    const login = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: "ana@test.dev", password: "nova-senha-456" });
    expect(login.status).toBe(200);
  });

  test("forgot-password is 204 for unknown e-mails and sends nothing", async () => {
    const res = await t
      .http()
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ninguem@test.dev" });
    expect(res.status).toBe(204);
    expect(t.mailer.outbox()).toHaveLength(0);
  });

  test("reset link works once, sets the password and revokes sessions", async () => {
    const user = await t.register("worker", { email: "maria@test.dev" });
    expect(
      (await t.http().post("/api/v1/auth/forgot-password").send({ email: "maria@test.dev" }))
        .status,
    ).toBe(204);

    const outbox = await t.http().get("/api/v1/dev/outbox");
    const text: string = outbox.body.messages[0].text;
    const link = text.match(/https?:\/\/\S+/)?.[0] ?? "";
    expect(link.startsWith("http://localhost:5173/redefinir-senha?token=")).toBe(true);
    const token = new URL(link).searchParams.get("token");

    const reset = () =>
      t.http().post("/api/v1/auth/reset-password").send({ token, password: "outra-senha-789" });
    expect((await reset()).status).toBe(204);
    expect((await reset()).status).toBe(400);
    expect((await t.http().get("/api/v1/me").auth(user.token, { type: "bearer" })).status).toBe(
      401,
    );
    const login = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: "maria@test.dev", password: "outra-senha-789" });
    expect(login.status).toBe(200);
  });

  test("reset tokens expire after 30 minutes", async () => {
    await t.register("worker", { email: "maria@test.dev" });
    await t.http().post("/api/v1/auth/forgot-password").send({ email: "maria@test.dev" });
    const token = new URL(
      t.mailer.outbox()[0]?.text.match(/https?:\/\/\S+/)?.[0] ?? "",
    ).searchParams.get("token");
    t.clock.advance(31 * 60 * 1000);
    const res = await t
      .http()
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "outra-senha-789" });
    expect(res.status).toBe(400);
  });
});

describe("rate limiting", () => {
  test("auth routes are limited per IP with a RATE_LIMITED body", async () => {
    const limited = setup({ RATE_LIMIT_AUTH: "2" });
    const login = () =>
      limited.http().post("/api/v1/auth/login").send({ email: "a@test.dev", password: "x" });
    await login();
    await login();
    const res = await login();
    limited.cleanup();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});
