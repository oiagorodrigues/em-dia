import { describe, expect, it } from "vite-plus/test";
import {
  abs,
  exists,
  files,
  importsOf,
  rel,
  resolveRelative,
  sourceForImports,
  violation,
} from "../src/scan.ts";

const CODE = [".ts", ".vue"] as const;
const ARCH = "docs/ARCHITECTURE.md";

const API_LAYERS = ["config", "db", "repos", "services", "http", "lib"] as const;
type ApiLayer = (typeof API_LAYERS)[number];

/** Layers each api layer may import from (besides itself). */
const API_ALLOWED: Record<ApiLayer, readonly ApiLayer[]> = {
  config: ["lib"],
  lib: ["config"],
  db: ["config", "lib"],
  repos: ["db", "config", "lib"],
  services: ["repos", "db", "config", "lib"],
  http: ["services", "repos", "config", "lib"],
};

const FRAMEWORK_IN_CORE =
  /^(express|express-rate-limit|helmet|multer|cookie-parser|supertest)(\/|$)/;

function apiLayerOf(path: string): ApiLayer | "server" | null {
  const m = path.match(/^apps\/api\/src\/([^/]+)/);
  if (!m) return null;
  const name = m[1]!.replace(/\.ts$/, "");
  if (name === "server") return "server";
  return (API_LAYERS as readonly string[]).includes(name) ? (name as ApiLayer) : null;
}

function violationsFor(
  dir: string,
  check: (file: string, spec: string, line: number) => string | null,
): string[] {
  const out: string[] = [];
  for (const file of files(dir, CODE)) {
    for (const { specifier, line } of importsOf(sourceForImports(file))) {
      const v = check(file, specifier, line);
      if (v) out.push(`${rel(file)}:${line} ${v}`);
    }
  }
  return out;
}

describe.skipIf(!exists("apps/api/src"))("api layering", () => {
  it("imports flow http -> services -> repos -> db only", () => {
    const bad = violationsFor("apps/api/src", (file, spec) => {
      if (!spec.startsWith(".")) return null;
      const from = apiLayerOf(rel(file));
      if (from === null || from === "server") return null;
      const target = resolveRelative(file, spec);
      const to = apiLayerOf(target);
      if (to === null || to === "server") {
        return to === "server"
          ? violation(
              `${from} imports server.ts (${spec})`,
              "server.ts is the composition root; move shared code into lib/ or config/",
              `${ARCH}#api-layering`,
            )
          : null;
      }
      if (to === from || API_ALLOWED[from].includes(to)) return null;
      return violation(
        `layer "${from}" imports from layer "${to}" (${spec})`,
        `move the logic so "${from}" only depends on: ${API_ALLOWED[from].join(", ")}`,
        `${ARCH}#api-layering`,
      );
    });
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("only server.ts imports from src/http", () => {
    const bad = violationsFor("apps/api/src", (file, spec) => {
      if (!spec.startsWith(".")) return null;
      const from = apiLayerOf(rel(file));
      if (from === "http" || from === "server" || from === null) return null;
      return apiLayerOf(resolveRelative(file, spec)) === "http"
        ? violation(
            `${rel(file)} imports http layer (${spec})`,
            "nothing outside src/http may import it; wire routes in server.ts",
            `${ARCH}#api-layering`,
          )
        : null;
    });
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("repos, services, db and config never import express or other http libraries", () => {
    const bad = violationsFor("apps/api/src", (file, spec) => {
      const from = apiLayerOf(rel(file));
      if (from === null || from === "http" || from === "server" || from === "lib") return null;
      return FRAMEWORK_IN_CORE.test(spec)
        ? violation(
            `layer "${from}" imports "${spec}"`,
            "keep HTTP concerns in src/http; pass plain values into services and repos",
            `${ARCH}#api-layering`,
          )
        : null;
    });
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

describe.skipIf(!exists("apps/web/src"))("web layering", () => {
  const WEB_LAYERS = ["api", "stores", "composables", "components", "views"] as const;
  type WebLayer = "api" | "stores" | "composables" | "ui" | "feature" | "views";

  const WEB_ALLOWED: Record<WebLayer, readonly WebLayer[]> = {
    api: [],
    stores: ["api"],
    composables: ["api", "stores"],
    ui: ["ui"],
    feature: ["ui", "feature", "api", "stores", "composables"],
    views: ["ui", "feature", "api", "stores", "composables"],
  };

  function webLayerOf(path: string): WebLayer | null {
    const m = path.match(/^apps\/web\/src\/([^/]+)(?:\/([^/]+))?/);
    if (!m) return null;
    const [, top, sub] = m;
    if (top === "components") {
      if (sub === "ui") return "ui";
      if (sub === "feature") return "feature";
      return null;
    }
    return (WEB_LAYERS as readonly string[]).includes(top!) ? (top as WebLayer) : null;
  }

  it("imports flow api -> stores -> composables -> components -> views", () => {
    const bad = violationsFor("apps/web/src", (file, spec) => {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
      const from = webLayerOf(rel(file));
      if (from === null) return null;
      const target = spec.startsWith("@/")
        ? `apps/web/src/${spec.slice(2)}`
        : resolveRelative(file, spec);
      const to = webLayerOf(target);
      if (to === null || to === from) return null;
      if (WEB_ALLOWED[from].includes(to)) return null;
      return violation(
        `web layer "${from}" imports layer "${to}" (${spec})`,
        `"${from}" may only import: ${WEB_ALLOWED[from].join(", ") || "nothing from other layers"}`,
        `${ARCH}#web-layering`,
      );
    });
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("ui components never import stores or the api client", () => {
    const bad = violationsFor("apps/web/src/components/ui", (file, spec) => {
      const hit = /(^|\/)(stores|api)(\/|$)/.test(spec) || /^pinia(\/|$)/.test(spec);
      return hit
        ? violation(
            `ui component imports "${spec}"`,
            "ui components are props-in, events-out; do the data work in a feature component or view",
            `${ARCH}#web-layering`,
          )
        : null;
    });
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

describe("workspace boundaries", () => {
  it("apps never import each other", () => {
    const bad: string[] = [];
    for (const [app, other] of [
      ["apps/api", "@ponto/web"],
      ["apps/web", "@ponto/api"],
    ] as const) {
      for (const file of files(app, CODE)) {
        for (const { specifier, line } of importsOf(sourceForImports(file))) {
          const crossRel =
            specifier.startsWith(".") &&
            /apps\/(api|web)\//.test(resolveRelative(file, specifier)) &&
            !resolveRelative(file, specifier).startsWith(app);
          if (specifier.startsWith(other) || crossRel) {
            bad.push(
              `${rel(file)}:${line} ${violation(
                `${app} imports ${specifier}`,
                "share code through packages/shared (@ponto/shared) instead",
                `${ARCH}#packages-and-dependency-direction`,
              )}`,
            );
          }
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("packages/shared imports nothing from apps, node:, express or vue", () => {
    const bad: string[] = [];
    for (const file of files("packages/shared/src", CODE)) {
      for (const { specifier, line } of importsOf(sourceForImports(file))) {
        const forbidden =
          specifier.startsWith("node:") ||
          /^(express|vue|pinia|vue-router)(\/|$)/.test(specifier) ||
          /^@ponto\/(api|web)/.test(specifier) ||
          /apps\/(api|web)/.test(specifier);
        if (forbidden) {
          bad.push(
            `${rel(file)}:${line} ${violation(
              `packages/shared imports "${specifier}"`,
              "shared must stay runtime-neutral (browser + node); only zod and relative imports are allowed",
              `${ARCH}#packages-and-dependency-direction`,
            )}`,
          );
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("architecture doc exists", () => {
    expect(exists("docs/ARCHITECTURE.md"), abs("docs/ARCHITECTURE.md")).toBe(true);
  });
});
