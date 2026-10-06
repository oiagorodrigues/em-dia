import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import viteConfig from "../vite.config.ts";
import { setup } from "./helpers.ts";

const ROOT = resolve(import.meta.dirname, "../../..");

interface VercelJson {
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  functions: Record<string, unknown>;
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as VercelJson;
const headerFor = (source: string, key: string) =>
  vercel.headers.find((h) => h.source === source)?.headers.find((h) => h.key === key)?.value;

/** vercel.json serves the PWA on Vercel; the Express static server serves it everywhere else. They must agree. */
describe("vercel.json", () => {
  let dist: string;
  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "emdia-vercel-dist-"));
    writeFileSync(join(dist, "index.html"), "<!doctype html>");
  });
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  test("the page CSP and cache policy match the Express static server", async () => {
    const t = await setup({ WEB_DIST_DIR: dist });
    const page = await t.http().get("/").set("Accept", "text/html");
    await t.cleanup();
    expect(headerFor("/((?!api/).*)", "Content-Security-Policy")).toBe(
      page.headers["content-security-policy"],
    );
    expect(headerFor("/assets/(.*)", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(headerFor("/((?!api/|assets/).*)", "Cache-Control")).toBe(page.headers["cache-control"]);
  });

  test("API rewrite comes first and names the parameter the function restores", () => {
    expect(vercel.rewrites[0]).toEqual({ source: "/api/:emdiaPath*", destination: "/api" });
    expect(vercel.rewrites[1]?.destination).toBe("/index.html");
  });

  test("the function re-exports the bundle that vp pack builds", () => {
    const [entry] = Object.keys(vercel.functions);
    expect(entry).toBe("api/index.mjs");
    expect(readFileSync(join(ROOT, entry ?? ""), "utf8")).toContain(
      'from "../apps/api/dist/vercel.mjs"',
    );
    expect(viteConfig.pack).toMatchObject({ entry: expect.arrayContaining(["src/vercel.ts"]) });
    expect(vercel.outputDirectory).toBe("apps/web/dist");
    expect(existsSync(join(ROOT, "apps/web/package.json"))).toBe(true);
  });

  test("the build runs the migrations it promises", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(vercel.buildCommand).toBe("bun run build:vercel");
    expect(pkg.scripts["build:vercel"]).toContain("db:migrate --if-configured");
  });
});
