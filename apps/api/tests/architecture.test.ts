import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, test } from "vite-plus/test";

const SRC = resolve(import.meta.dirname, "../src");

/** Which layers each layer may import from (besides itself). */
const ALLOWED: Record<string, string[]> = {
  config: [],
  lib: ["config"],
  db: ["config", "lib"],
  repos: ["db", "config", "lib"],
  services: ["repos", "config", "lib"],
  http: ["services", "config", "lib"],
  scripts: ["db", "repos", "services", "config", "lib"],
  "server.ts": ["db", "http", "services", "config", "lib"],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? sourceFiles(join(dir, d.name))
      : d.name.endsWith(".ts")
        ? [join(dir, d.name)]
        : [],
  );
}

const layerOf = (file: string) => relative(SRC, file).split("/")[0] ?? "";

describe("layering", () => {
  const files = sourceFiles(SRC);

  test.each(files.map((f) => [relative(SRC, f), f]))(
    "%s imports only allowed layers",
    (_name, file) => {
      const from = layerOf(file);
      const allowed = ALLOWED[from];
      expect(allowed, `unknown layer ${from}`).toBeDefined();
      const specifiers = [...readFileSync(file, "utf8").matchAll(/from\s+"(\.[^"]+)"/g)].map(
        (m) => m[1] ?? "",
      );
      for (const spec of specifiers) {
        const to = layerOf(resolve(dirname(file), spec));
        if (to === from || spec.endsWith("package.json")) continue;
        expect(allowed, `${relative(SRC, file)} imports ${spec}`).toContain(to);
      }
    },
  );

  test("express stays in the http layer", () => {
    for (const file of files) {
      if (["http", "server.ts"].includes(layerOf(file))) continue;
      expect(readFileSync(file, "utf8"), relative(SRC, file)).not.toMatch(
        /from "(express|multer|helmet)"/,
      );
    }
  });
});
