import { randomBytes } from "node:crypto";
import { z } from "zod";
import pkg from "../../package.json" with { type: "json" };

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default("./data/emdia.db"),
  UPLOAD_DIR: z.string().min(1).default("./data/uploads"),
  JWT_SECRET: z.string().optional(),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  TRUST_PROXY: z.string().default("false"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  RATE_LIMIT_GLOBAL: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_AUTH: z.coerce.number().int().min(1).default(10),
  WEB_DIST_DIR: z.string().trim().optional(),
  REFRESH_REUSE_GRACE_MS: z.coerce.number().int().min(0).max(300_000).default(20_000),
});

export interface Config {
  env: "development" | "test" | "production";
  isProduction: boolean;
  version: string;
  port: number;
  databasePath: string;
  uploadDir: string;
  jwtSecret: string;
  /** True when the secret was generated at boot because none was configured. */
  jwtSecretEphemeral: boolean;
  webOrigin: string;
  trustProxy: boolean | number | string;
  logLevel: LogLevel;
  rateLimit: { global: number; auth: number };
  /** Built web app to serve next to the API (single-origin deploys); null when the API runs alone. */
  webDistDir: string | null;
  /** How long a just-rotated refresh token may still be presented without counting as reuse. */
  refreshReuseGraceMs: number;
}

function parseTrustProxy(value: string): boolean | number | string {
  if (value === "true") return true;
  if (value === "false" || value === "") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/** Throws with every invalid variable listed; callers should let it crash the process. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === "production";
  const secret = e.JWT_SECRET?.trim() || undefined;

  if (secret !== undefined && secret.length < 32) {
    throw new Error("Invalid environment: JWT_SECRET must be at least 32 characters");
  }
  if (isProduction && secret === undefined) {
    throw new Error("Invalid environment: JWT_SECRET is required in production");
  }

  return {
    env: e.NODE_ENV,
    isProduction,
    version: pkg.version,
    port: e.PORT,
    databasePath: e.DATABASE_PATH,
    uploadDir: e.UPLOAD_DIR,
    jwtSecret: secret ?? randomBytes(48).toString("base64url"),
    jwtSecretEphemeral: secret === undefined,
    webOrigin: new URL(e.WEB_ORIGIN).origin,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    logLevel: e.LOG_LEVEL,
    rateLimit: { global: e.RATE_LIMIT_GLOBAL, auth: e.RATE_LIMIT_AUTH },
    refreshReuseGraceMs: e.REFRESH_REUSE_GRACE_MS,
    webDistDir: e.WEB_DIST_DIR || null,
  };
}
