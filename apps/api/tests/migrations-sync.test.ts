import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const API = resolve(import.meta.dirname, "..");

/**
 * `drizzle-kit check` only validates the migration history; it does not notice
 * a schema.ts change without a migration. Generating into a copy of drizzle/
 * does: if the copy gains a file, someone forgot `bun run db:generate`.
 */
test("drizzle/ migrations match src/db/schema.ts", () => {
  const out = mkdtempSync(join(tmpdir(), "emdia-drizzle-"));
  try {
    cpSync(join(API, "drizzle"), out, { recursive: true });
    const before = readdirSync(out).sort();
    execFileSync(
      join(API, "node_modules/.bin/drizzle-kit"),
      ["generate", "--dialect", "postgresql", "--schema", "./src/db/schema.ts", "--out", out],
      { cwd: API, stdio: "pipe" },
    );
    expect(readdirSync(out).sort()).toEqual(before);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}, 60_000);
