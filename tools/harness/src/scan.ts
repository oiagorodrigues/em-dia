import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vite-hooks", "coverage"]);

export function abs(...parts: string[]): string {
  return join(ROOT, ...parts);
}

export function exists(...parts: string[]): boolean {
  return existsSync(abs(...parts));
}

export function walk(dir: string, exts: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out.sort();
}

export const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");

export function files(subdir: string, exts: readonly string[]): string[] {
  return walk(abs(subdir), exts);
}

export function read(file: string): string {
  return readFileSync(file, "utf8");
}

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"\n;]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

export interface ImportRef {
  specifier: string;
  line: number;
}

export function importsOf(source: string): ImportRef[] {
  const refs: ImportRef[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const specifier = m[1] ?? m[2];
    if (!specifier) continue;
    const line = source.slice(0, m.index + m[0].length).split("\n").length;
    refs.push({ specifier, line });
  }
  return refs;
}

export function sfcScript(source: string): string {
  const blocks = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  return blocks.map((b) => b[1]).join("\n");
}

export function sourceForImports(file: string): string {
  const text = read(file);
  return file.endsWith(".vue") ? sfcScript(text) : text;
}

/** Resolve a relative specifier to a repo-relative path without extension handling. */
export function resolveRelative(file: string, specifier: string): string {
  return rel(resolve(dirname(file), specifier));
}

export function violation(what: string, fix: string, ref: string): string {
  return `WHAT: ${what} | FIX: ${fix} | REF: ${ref}`;
}
