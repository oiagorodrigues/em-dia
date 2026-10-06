import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { setup, type TestEnv } from "./helpers.ts";

const INDEX = "<!doctype html><title>em dia</title>";
let dist: string;
let t: TestEnv;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "emdia-web-dist-"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), INDEX);
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(dist, "sw.js"), "self.skipWaiting()");
  writeFileSync(join(dist, "workbox-98f7a950.js"), "/* wb */");
  writeFileSync(join(dist, "manifest.webmanifest"), "{}");
  writeFileSync(join(dist, ".env"), "SECRET=1");
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

beforeEach(() => {
  t = setup({ WEB_DIST_DIR: dist });
});
afterEach(() => t.cleanup());

const html = { Accept: "text/html,application/xhtml+xml" };

describe("web app serving", () => {
  test("fingerprinted assets are immutable", async () => {
    const res = await t.http().get("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test.each(["/sw.js", "/workbox-98f7a950.js", "/manifest.webmanifest"])(
    "%s must revalidate",
    async (path) => {
      const res = await t.http().get(path);
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-cache");
    },
  );

  test("navigations fall back to index.html with the PWA CSP", async () => {
    for (const path of ["/", "/contratos/abc/cartao", "/redefinir-senha?token=x"]) {
      const res = await t.http().get(path).set(html);
      expect(res.status).toBe(200);
      expect(res.text).toBe(INDEX);
      expect(res.headers["cache-control"]).toBe("no-cache");
      const csp = res.headers["content-security-policy"];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("worker-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).not.toContain("unsafe-inline");
    }
  });

  test("non-navigation misses, dotfiles and /api paths do not get index.html", async () => {
    expect((await t.http().get("/assets/missing.js").set(html)).status).toBe(404);
    expect((await t.http().get("/missing.js").set("Accept", "*/*")).status).toBe(404);
    expect((await t.http().get("/.env").set("Accept", "*/*")).status).toBe(404);
    const api = await t.http().get("/api/nope").set(html);
    expect(api.status).toBe(404);
    expect(api.body.error.code).toBe("NOT_FOUND");
  });

  test("the API keeps its own strict CSP and no-store", async () => {
    const res = await t.http().get("/api/health");
    expect(res.body.status).toBe("ok");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  test("HSTS only in production", async () => {
    expect(
      (await t.http().get("/").set(html)).headers["strict-transport-security"],
    ).toBeUndefined();
    const prod = setup({ WEB_DIST_DIR: dist, NODE_ENV: "production" });
    const res = await prod.http().get("/").set(html);
    prod.cleanup();
    expect(res.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
  });

  test("static files are not rate limited by the API limiter", async () => {
    const limited = setup({ WEB_DIST_DIR: dist, RATE_LIMIT_GLOBAL: "2" });
    const statuses = [];
    for (let i = 0; i < 5; i++)
      statuses.push((await limited.http().get("/assets/index-abc123.js")).status);
    limited.cleanup();
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
  });

  test("a dist dir without index.html fails fast", () => {
    expect(() => setup({ WEB_DIST_DIR: join(dist, "assets") })).toThrow(/index.html/);
  });
});

test("without WEB_DIST_DIR non-API paths are plain 404s with the strict CSP", async () => {
  const api = setup();
  const res = await api.http().get("/").set(html);
  api.cleanup();
  expect(res.status).toBe(404);
  expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
});
