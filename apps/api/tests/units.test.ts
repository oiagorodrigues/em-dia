import { describe, expect, test } from "vite-plus/test";
import { loadConfig } from "../src/config/index.ts";
import { hashPassword, verifyPassword } from "../src/lib/crypto.ts";
import { centsToDecimal, csvCell } from "../src/lib/csv.ts";
import { createLogger } from "../src/lib/logger.ts";
import { createFileStore } from "../src/lib/storage.ts";
import { sanitizeFilename } from "../src/services/payments.ts";

describe("csv", () => {
  test.each([
    ["=1+1", "'=1+1"],
    ["+55 11", "'+55 11"],
    ["-10", "'-10"],
    ["@cmd", "'@cmd"],
    ["a;b", '"a;b"'],
    ['diz "oi"', '"diz ""oi"""'],
    ["linha\nnova", '"linha\nnova"'],
    ["normal", "normal"],
  ])("%j → %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  test("cents to pt-BR decimal", () => {
    expect(centsToDecimal(123456)).toBe("1234,56");
    expect(centsToDecimal(-5)).toBe("-0,05");
    expect(centsToDecimal(0)).toBe("0,00");
  });
});

describe("passwords", () => {
  test("hash embeds parameters and verifies", async () => {
    const hash = await hashPassword("segredo-123");
    expect(hash).toMatch(/^scrypt\$15\$8\$1\$/);
    expect(await verifyPassword("segredo-123", hash)).toBe(true);
    expect(await verifyPassword("segredo-124", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("config", () => {
  test("production requires a long JWT_SECRET", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: "production", JWT_SECRET: "short" })).toThrow(/32/);
    expect(loadConfig({ NODE_ENV: "development" }).jwtSecretEphemeral).toBe(true);
  });

  test("invalid values fail fast", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(loadConfig({ TRUST_PROXY: "1" }).trustProxy).toBe(1);
    expect(loadConfig({ TRUST_PROXY: "loopback" }).trustProxy).toBe("loopback");
  });
});

describe("logger", () => {
  test("redacts secret-looking fields", () => {
    const lines: string[] = [];
    createLogger("info", {}, (l) => lines.push(l)).info("x", {
      password: "p",
      nested: { accessToken: "t", ok: 1 },
      headers: { authorization: "Bearer t", cookie: "c" },
    });
    const entry = JSON.parse(lines[0] ?? "{}");
    expect(entry.password).toBe("[redacted]");
    expect(entry.nested).toEqual({ accessToken: "[redacted]", ok: 1 });
    expect(entry.headers).toEqual({ authorization: "[redacted]", cookie: "[redacted]" });
  });
});

describe("file names", () => {
  test("stored names cannot escape the upload dir", () => {
    const store = createFileStore("/tmp/emdia-never-used");
    expect(() => store.open("../../etc/passwd")).toThrow();
    expect(() => store.open("abc.png")).toThrow();
  });

  test("original names are sanitised for display", () => {
    expect(sanitizeFilename("C:\\Users\\x\\recibo setembro.pdf")).toBe("recibo setembro.pdf");
    expect(sanitizeFilename("../..")).toBe("comprovante");
    expect(sanitizeFilename('a"b<c>.png')).toBe("abc.png");
  });
});
