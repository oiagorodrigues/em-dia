import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { del, get, put } from "@vercel/blob";
import { randomFileName, type FileStore } from "./storage.ts";

/** The subset of @vercel/blob used here, injectable so tests don't hit the network. */
export interface BlobClient {
  put: typeof put;
  get: typeof get;
  del: typeof del;
}

const PATH_RE = /^receipts\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/;

/**
 * Receipts in a private Vercel Blob store. Private blobs need a token to read,
 * so the API keeps authorising and streaming every download; blob URLs never
 * reach the browser. `token` is optional on Vercel, where the SDK falls back
 * to OIDC with the connected store.
 */
export function createBlobStore(
  { token }: { token: string | null },
  client: BlobClient = { put, get, del },
): FileStore {
  const auth = token ? { token } : {};
  const check = (name: string) => {
    if (!PATH_RE.test(name)) throw new Error(`invalid stored blob name: ${name}`);
    return name;
  };

  return {
    kind: "vercel-blob",
    async save(data, ext, contentType) {
      const pathname = `receipts/${randomFileName(ext)}`;
      await client.put(pathname, Buffer.from(data), {
        access: "private",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: false,
        ...auth,
      });
      return pathname;
    },
    async open(name) {
      const result = await client.get(check(name), { access: "private", ...auth });
      if (!result || result.statusCode !== 200) return null;
      return Readable.fromWeb(result.stream as NodeReadableStream<Uint8Array>);
    },
    async remove(name) {
      await client.del(check(name), auth);
    },
  };
}
