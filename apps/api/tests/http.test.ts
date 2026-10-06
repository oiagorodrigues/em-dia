import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { setup, type TestEnv } from "./helpers.ts";

let t: TestEnv;
beforeEach(async () => {
  t = await setup();
});
afterEach(() => t.cleanup());

describe("http hardening", () => {
  test("health reports db and version", async () => {
    const res = await t.http().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok", version: "0.0.0" });
  });

  test("security headers, request id, no x-powered-by", async () => {
    const res = await t.http().get("/api/health").set("X-Request-Id", "client-req-12345");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBe("client-req-12345");
    const generated = await t.http().get("/api/health").set("X-Request-Id", "bad id with spaces");
    expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("CORS only for the configured origin", async () => {
    const allowed = await t
      .http()
      .options("/api/v1/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");
    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const other = await t.http().get("/api/health").set("Origin", "https://evil.example");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("unknown routes, bad JSON and oversized bodies use the error envelope", async () => {
    const missing = await t.http().get("/api/v1/nope");
    expect(missing.status).toBe(401);
    const unknown = await t.http().get("/nope");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("NOT_FOUND");

    const bad = await t
      .http()
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION");

    const big = await t
      .http()
      .post("/api/v1/auth/login")
      .send({ email: "a@b.co", password: "x".repeat(200 * 1024) });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("dev outbox is not mounted in production", async () => {
    const prod = await setup({ NODE_ENV: "production" });
    const res = await prod.http().get("/api/v1/dev/outbox");
    await prod.cleanup();
    expect(res.status).toBe(401);
  });
});
