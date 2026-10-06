import { Readable } from "node:stream";
import { describe, expect, test, vi } from "vite-plus/test";
import { loadConfig } from "../src/config/index.ts";
import { createBlobStore, type BlobClient } from "../src/lib/blob-store.ts";
import { upstashCommand } from "../src/lib/upstash.ts";
import { restoreOriginalUrl } from "../src/lib/vercel-url.ts";

const VERCEL_ENV = {
  VERCEL: "1",
  NODE_ENV: "production",
  JWT_SECRET: "x".repeat(40),
  DATABASE_URL: "libsql://emdia-org.turso.io",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",
};

describe("restoreOriginalUrl", () => {
  test.each([
    ["/api/v1/contracts?include=archived", "/api/v1/contracts?include=archived"],
    ["/api?emdiaPath=v1%2Fcontracts&include=archived", "/api/v1/contracts?include=archived"],
    ["/api/index?emdiaPath=v1/auth/login", "/api/v1/auth/login"],
    ["/api?emdiaPath=health", "/api/health"],
    ["/api/v1/team?month=2026-10&emdiaPath=v1/team", "/api/v1/team?month=2026-10"],
    ["/api", "/api"],
  ])("%s → %s", (raw, expected) => {
    expect(restoreOriginalUrl(raw)).toBe(expected);
  });
});

describe("Vercel config", () => {
  test("requires a remote database and a Blob store", () => {
    expect(() => loadConfig({ ...VERCEL_ENV, DATABASE_URL: "" })).toThrow(/libsql/);
    expect(() => loadConfig({ ...VERCEL_ENV, DATABASE_URL: "./data/emdia.db" })).toThrow(/libsql/);
    expect(() => loadConfig({ ...VERCEL_ENV, BLOB_READ_WRITE_TOKEN: "" })).toThrow(/Blob/);
  });

  test("defaults that fit the platform", () => {
    const config = loadConfig({ ...VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL: "emdia.app" });
    expect(config).toMatchObject({
      onVercel: true,
      trustProxy: 1,
      webOrigin: "https://emdia.app",
      databaseUrl: "libsql://emdia-org.turso.io",
      blob: { token: "vercel_blob_rw_test" },
      receiptMaxBytes: 4 * 1024 * 1024,
    });
    expect(
      loadConfig({ ...VERCEL_ENV, BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "store_1" }).blob,
    ).toEqual({ token: null });
  });

  test("every Vercel deployment runs as production, even without NODE_ENV", () => {
    const { NODE_ENV: _unset, ...env } = VERCEL_ENV;
    expect(loadConfig(env)).toMatchObject({ env: "production", isProduction: true });
    expect(() => loadConfig({ ...env, JWT_SECRET: "" })).toThrow(/JWT_SECRET/);
  });

  test("outside Vercel nothing changes", () => {
    const config = loadConfig({ NODE_ENV: "development" });
    expect(config).toMatchObject({
      onVercel: false,
      trustProxy: false,
      blob: null,
      upstash: null,
      receiptMaxBytes: 5 * 1024 * 1024,
    });
    expect(config.databaseUrl).toBe("./data/emdia.db");
  });

  test("Upstash needs both URL and token", () => {
    expect(() => loadConfig({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" })).toThrow(/UPSTASH/);
    expect(
      loadConfig({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" })
        .upstash,
    ).toEqual({ url: "https://x.upstash.io", token: "t" });
  });
});

describe("upstashCommand", () => {
  test("posts the command as a JSON array with the bearer token", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ result: 3 }));
    const send = upstashCommand(
      { url: "https://x.upstash.io", token: "secret" },
      fetchImpl as typeof fetch,
    );
    expect(await send("INCR", "rl:global:1.2.3.4")).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith("https://x.upstash.io", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: '["INCR","rl:global:1.2.3.4"]',
    });
  });

  test("surfaces Upstash errors", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "NOSCRIPT" }, { status: 400 }));
    const send = upstashCommand(
      { url: "https://x.upstash.io", token: "t" },
      fetchImpl as typeof fetch,
    );
    await expect(send("EVALSHA", "abc", "1", "k")).rejects.toThrow(/NOSCRIPT/);
  });
});

describe("Vercel Blob store", () => {
  function fakeClient() {
    const blobs = new Map<string, { data: Buffer; contentType: string }>();
    const calls: { op: string; args: unknown[] }[] = [];
    const client = {
      put: vi.fn(async (pathname: string, body: Buffer, options: { contentType: string }) => {
        calls.push({ op: "put", args: [pathname, options] });
        blobs.set(pathname, { data: body, contentType: options.contentType });
        return { pathname } as never;
      }),
      get: vi.fn(async (pathname: string, options: unknown) => {
        calls.push({ op: "get", args: [pathname, options] });
        const blob = blobs.get(pathname);
        if (!blob) return null;
        return {
          statusCode: 200,
          stream: new Blob([new Uint8Array(blob.data)]).stream(),
          blob: { contentType: blob.contentType, size: blob.data.length },
        } as never;
      }),
      del: vi.fn(async (pathname: string, options: unknown) => {
        calls.push({ op: "del", args: [pathname, options] });
        blobs.delete(pathname);
      }),
    };
    return { client: client as unknown as BlobClient, calls, blobs };
  }

  const read = async (stream: Readable) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  };

  test("stores privately under an unguessable name and streams it back", async () => {
    const { client, calls } = fakeClient();
    const store = createBlobStore({ token: "tok" }, client);
    const name = await store.save(Buffer.from("png-bytes"), "png", "image/png");
    expect(name).toMatch(/^receipts\/[a-f0-9]{32}\.png$/);
    expect(calls[0]).toEqual({
      op: "put",
      args: [
        name,
        {
          access: "private",
          contentType: "image/png",
          addRandomSuffix: false,
          allowOverwrite: false,
          token: "tok",
        },
      ],
    });

    const stream = await store.open(name);
    expect(stream).not.toBeNull();
    expect((await read(stream as Readable)).toString()).toBe("png-bytes");
    expect(calls[1]).toEqual({ op: "get", args: [name, { access: "private", token: "tok" }] });

    await store.remove(name);
    expect(await store.open(name)).toBeNull();
  });

  test("without a token the SDK's own (OIDC) credentials are used", async () => {
    const { client, calls } = fakeClient();
    const store = createBlobStore({ token: null }, client);
    await store.save(Buffer.from("x"), "pdf", "application/pdf");
    expect(calls[0]?.args[1]).not.toHaveProperty("token");
  });

  test("never touches names that did not come from it", async () => {
    const { client } = fakeClient();
    const store = createBlobStore({ token: "tok" }, client);
    await expect(store.open("../secrets.txt")).rejects.toThrow();
    await expect(store.remove("receipts/../../x")).rejects.toThrow();
    expect(client.get).not.toHaveBeenCalled();
  });
});
