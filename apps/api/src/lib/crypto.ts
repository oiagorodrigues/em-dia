import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const LOG_N = 15;
const R = 8;
const P = 1;
const KEY_LEN = 64;

/** scrypt needs 128 * N * r bytes; give it headroom over that. */
function maxmem(n: number, r: number): number {
  return 128 * n * r * 2;
}

/** Format: `scrypt$<log2 N>$<r>$<p>$<salt b64url>$<hash b64url>` so parameters can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const n = 2 ** LOG_N;
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEY_LEN, {
    N: n,
    r: R,
    p: P,
    maxmem: maxmem(n, R),
  });
  return ["scrypt", LOG_N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !logN || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const n = 2 ** Number(logN);
  const key = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(salt, "base64url"),
    expected.length,
    {
      N: n,
      r: Number(r),
      p: Number(p),
      maxmem: maxmem(n, Number(r)),
    },
  );
  return timingSafeEqual(key, expected);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(key: string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

/** 256-bit opaque token. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function randomCode(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}
