import { readdirSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { abs, exists, files, read, rel, violation } from "../src/scan.ts";

const WEB_SRC = "apps/web/src";
const API_SRC = "apps/api/src";

function lineHits(file: string, re: RegExp): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  read(file)
    .split("\n")
    .forEach((text, i) => {
      if (re.test(text)) hits.push({ line: i + 1, text: text.trim() });
    });
  return hits;
}

function collect(
  fileList: string[],
  re: RegExp,
  make: (file: string, hit: { line: number; text: string }) => string,
): string[] {
  return fileList.flatMap((f) => lineHits(f, re).map((h) => make(f, h)));
}

describe.skipIf(!exists(WEB_SRC))("web taste", () => {
  const all = files(WEB_SRC, [".ts", ".vue", ".css"]);

  it("does not store tokens in localStorage or sessionStorage", () => {
    const bad = collect(
      all,
      /(localStorage|sessionStorage)\s*\.\s*setItem\([^)]*(token|jwt|access|refresh)/i,
      (f, h) =>
        `${rel(f)}:${h.line} ${violation(
          "token written to web storage",
          "keep the access token in memory (Pinia state); the refresh token lives in an HttpOnly cookie",
          "docs/SECURITY.md#controls",
        )}`,
    );
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("does not use v-html", () => {
    const bad = collect(
      files(WEB_SRC, [".vue", ".ts"]),
      /v-html|innerHTML\s*=/,
      (f, h) =>
        `${rel(f)}:${h.line} ${violation(
          "v-html / innerHTML used",
          "render text with {{ }} interpolation so Vue escapes it",
          "docs/SECURITY.md#controls",
        )}`,
    );
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("uses no raw hex colors outside styles/tokens.css", () => {
    const candidates = all.filter((f) => rel(f) !== `${WEB_SRC}/styles/tokens.css`);
    const bad = collect(
      candidates,
      /#[0-9a-fA-F]{3,8}\b(?![0-9a-zA-Z-])/,
      (f, h) =>
        `${rel(f)}:${h.line} ${violation(
          `raw hex color in "${h.text.slice(0, 60)}"`,
          "use a CSS custom property such as var(--ink) or var(--blue)",
          "docs/DESIGN.md#tokens",
        )}`,
    ).filter((m) => !/&#\d|href="#|\burl\(#|id="#/.test(m));
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

describe.skipIf(!exists(API_SRC))("api taste", () => {
  it("does not call console.log outside the logger module", () => {
    const candidates = files(API_SRC, [".ts"]).filter(
      (f) => !rel(f).endsWith("/lib/logger.ts") && !/\/scripts\//.test(rel(f)),
    );
    const bad = collect(
      candidates,
      /console\.(log|debug|info)\(/,
      (f, h) =>
        `${rel(f)}:${h.line} ${violation(
          "console.log in api source",
          "use the logger from src/lib/logger.ts (structured, with request id, redacts secrets)",
          "docs/RELIABILITY.md#logging",
        )}`,
    );
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("every route file validates input through @emdia/shared or zod", () => {
    const routeFiles = files(`${API_SRC}/http/routes`, [".ts"]).filter(
      (f) => !f.endsWith(".test.ts") && !f.endsWith("/index.ts"),
    );
    const bad: string[] = [];
    for (const f of routeFiles) {
      const src = read(f);
      const hasHandlers = /\.(get|post|put|patch|delete)\(/.test(src);
      const validates = /from\s+["'](@emdia\/shared|zod)["']/.test(src);
      if (hasHandlers && !validates) {
        bad.push(
          `${rel(f)} ${violation(
            "route file defines handlers but imports no schema from @emdia/shared or zod",
            "parse params/query/body with a schema from @emdia/shared before calling a service",
            "docs/SECURITY.md#controls",
          )}`,
        );
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

describe("repo taste", () => {
  it("has no ESLint or Prettier in package.json or config files", () => {
    const manifests = [
      "package.json",
      ...["apps", "packages", "tools"].flatMap((d) =>
        exists(d)
          ? readdirSync(abs(d), { withFileTypes: true })
              .filter((e) => e.isDirectory())
              .map((e) => `${d}/${e.name}/package.json`)
              .filter((p) => exists(p))
          : [],
      ),
    ];
    const bad: string[] = [];
    for (const m of manifests) {
      read(abs(m))
        .split("\n")
        .forEach((text, i) => {
          if (/"[^"]*(eslint|prettier)[^"]*"/i.test(text)) {
            bad.push(
              `${m}:${i + 1} ${violation(
                `"${text.trim()}" references eslint/prettier`,
                "remove it; use `vp lint` (oxlint) and `vp fmt` (oxfmt)",
                "AGENTS.md#golden-principles",
              )}`,
            );
          }
        });
    }
    const rootEntries = readdirSync(abs("."));
    for (const name of rootEntries) {
      if (/^\.?(eslint|prettier)/i.test(name) || /^(eslint|prettier)\.config/i.test(name)) {
        bad.push(
          violation(
            `config file ${name} exists`,
            "delete it; formatting and linting are configured in vite.config.ts",
            "AGENTS.md#golden-principles",
          ),
        );
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
