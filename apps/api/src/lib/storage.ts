import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { randomBytes } from "node:crypto";

export interface FileStore {
  readonly kind: "filesystem" | "vercel-blob";
  /** Returns the generated name; the caller never chooses it. */
  save(data: Uint8Array, ext: string, contentType: string): Promise<string>;
  /** null when the object no longer exists. */
  open(name: string): Promise<Readable | null>;
  remove(name: string): Promise<void>;
}

/** 128 random bits: unguessable, and the only part of a stored name that varies. */
export const randomFileName = (ext: string) => `${randomBytes(16).toString("hex")}.${ext}`;

const STORED_NAME_RE = /^[a-f0-9]{32}\.[a-z0-9]{2,5}$/;

export function createFileStore(dir: string): FileStore {
  const root = resolve(dir);
  let ready: Promise<unknown> | undefined;

  // Names come from our DB, but validating them keeps path traversal impossible even if a row is tampered with.
  const pathOf = (name: string) => {
    if (!STORED_NAME_RE.test(name)) throw new Error(`invalid stored file name: ${name}`);
    return join(root, name);
  };

  return {
    kind: "filesystem",
    async save(data, ext) {
      ready ??= mkdir(root, { recursive: true, mode: 0o700 });
      await ready;
      const name = randomFileName(ext);
      await writeFile(pathOf(name), data, { flag: "wx", mode: 0o600 });
      return name;
    },
    async open(name) {
      const path = pathOf(name);
      try {
        await stat(path);
      } catch {
        return null;
      }
      return createReadStream(path);
    },
    remove: (name) => rm(pathOf(name), { force: true }),
  };
}
