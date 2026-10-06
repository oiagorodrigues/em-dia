import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { abs, exists, files, read, rel, violation } from "../src/scan.ts";

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function markdownFiles(): string[] {
  const list = files("docs", [".md"]);
  if (exists("AGENTS.md")) list.push(abs("AGENTS.md"));
  return list;
}

function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

describe("doc gardening", () => {
  it("resolves every relative markdown link", () => {
    const bad: string[] = [];
    for (const file of markdownFiles()) {
      const text = stripCode(read(file));
      for (const m of text.matchAll(LINK_RE)) {
        const target = m[1]!;
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const path = target.split("#")[0]!;
        if (!path) continue;
        if (!existsSync(resolve(dirname(file), path))) {
          bad.push(
            `${rel(file)} ${violation(
              `broken link to "${target}"`,
              "fix the path or create the target file",
              "docs/PLANS.md#doc-gardening",
            )}`,
          );
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("keeps AGENTS.md at 120 lines or fewer", () => {
    const lines = read(abs("AGENTS.md")).split("\n").length;
    expect(
      lines,
      violation(
        `AGENTS.md has ${lines} lines`,
        "move detail into docs/ and link to it; AGENTS.md is a map, not an encyclopedia",
        "docs/design-docs/core-beliefs.md",
      ),
    ).toBeLessThanOrEqual(120);
  });

  it("gives every active exec plan a Status section", () => {
    const dir = abs("docs/exec-plans/active");
    const plans = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
    const bad = plans
      .filter((f) => !/^## Status\s*$/m.test(read(abs("docs/exec-plans/active", f))))
      .map((f) =>
        violation(
          `docs/exec-plans/active/${f} has no "## Status" section`,
          "add a Status section with current state and next step",
          "docs/PLANS.md#plan-format",
        ),
      );
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
