import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const STORED_NAME_RE = /^[a-f0-9]{32}\.[a-z0-9]{2,5}$/;

export interface FileStore {
  /** Returns the generated file name; the caller never chooses it. */
  save(data: Uint8Array, ext: string): Promise<string>;
  open(name: string): ReadStream;
  remove(name: string): Promise<void>;
}

export function createFileStore(dir: string): FileStore {
  const root = resolve(dir);
  let ready: Promise<unknown> | undefined;

  // Names come from our DB, but validating them keeps path traversal impossible even if a row is tampered with.
  const pathOf = (name: string) => {
    if (!STORED_NAME_RE.test(name)) throw new Error(`invalid stored file name: ${name}`);
    return join(root, name);
  };

  return {
    async save(data, ext) {
      ready ??= mkdir(root, { recursive: true, mode: 0o700 });
      await ready;
      const name = `${randomBytes(16).toString("hex")}.${ext}`;
      await writeFile(pathOf(name), data, { flag: "wx", mode: 0o600 });
      return name;
    },
    open: (name) => createReadStream(pathOf(name)),
    remove: (name) => rm(pathOf(name), { force: true }),
  };
}
