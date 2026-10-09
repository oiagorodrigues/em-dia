import { randomBytes } from "node:crypto";
import { RECEIPT_MAX_BYTES } from "@emdia/shared";
import { z } from "zod";
import pkg from "../../package.json" with { type: "json" };

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().trim().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().trim().optional(),
  BLOB_STORE_ID: z.string().trim().optional(),
  UPSTASH_REDIS_REST_URL: z.string().trim().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().optional(),
  UPSTASH_REDIS_KV_REST_API_URL: z.string().trim().optional(),
  UPSTASH_REDIS_KV_REST_API_TOKEN: z.string().trim().optional(),
  KV_REST_API_URL: z.string().trim().optional(),
  KV_REST_API_TOKEN: z.string().trim().optional(),
  VERCEL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().trim().optional(),
  UPLOAD_DIR: z.string().min(1).default("./data/uploads"),
  JWT_SECRET: z.string().optional(),
  WEB_ORIGIN: z.url().optional(),
  TRUST_PROXY: z.string().optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  RATE_LIMIT_GLOBAL: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_AUTH: z.coerce.number().int().min(1).default(10),
  WEB_DIST_DIR: z.string().trim().optional(),
  SMTP_URL: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^smtps?:\/\//.test(v), "SMTP_URL must start with smtp:// or smtps://"),
  MAIL_FROM: z.string().trim().min(3).default("em dia <nao-responda@localhost>"),
  FEEDBACK_TO: z.email().default("yagomello16@gmail.com"),
  RATE_LIMIT_FEEDBACK: z.coerce.number().int().min(1).default(5),
  REFRESH_REUSE_GRACE_MS: z.coerce.number().int().min(0).max(300_000).default(20_000),
});

/** Leaves room for the multipart envelope under Vercel's 4.5 MB request limit. */
const VERCEL_RECEIPT_MAX_BYTES = 4 * 1024 * 1024;

export interface Config {
  env: "development" | "test" | "production";
  isProduction: boolean;
  version: string;
  port: number;
  /** `postgres://…` (Neon, Docker) or `pglite:<dir>`; undefined means PGlite in ./data/pglite. */
  databaseUrl: string | undefined;
  /** Receipts go to a private Vercel Blob store when a token or connected store is present. */
  blob: { token: string | null } | null;
  upstash: { url: string; token: string } | null;
  /** Running as a Vercel Function: ephemeral disk, one process per instance. */
  onVercel: boolean;
  /** Vercel rejects function bodies over 4.5 MB before our code runs, so the limit drops there. */
  receiptMaxBytes: number;
  uploadDir: string;
  jwtSecret: string;
  /** True when the secret was generated at boot because none was configured. */
  jwtSecretEphemeral: boolean;
  webOrigin: string;
  trustProxy: boolean | number | string;
  logLevel: LogLevel;
  rateLimit: { global: number; auth: number; feedback: number };
  /** Built web app to serve next to the API (single-origin deploys); null when the API runs alone. */
  webDistDir: string | null;
  smtpUrl: string | null;
  mailFrom: string;
  /** Inbox that receives "enviar feedback". */
  feedbackTo: string;
  /** How long a just-rotated refresh token may still be presented without counting as reuse. */
  refreshReuseGraceMs: number;
}

function parseTrustProxy(value: string): boolean | number | string {
  if (value === "true") return true;
  if (value === "false" || value === "") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/** Just the database settings, for scripts that must not require the rest (the build's migrate step). */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): {
  url: string | undefined;
  explicit: boolean;
} {
  // Migrations take a session-level advisory lock, which Neon's pooler (transaction mode) does not keep:
  // prefer the direct URL the Neon integration provides, else drop the documented `-pooler` host suffix.
  const direct = env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim() || undefined;
  return { url: direct ? withoutNeonPooler(direct) : undefined, explicit: Boolean(direct) };
}

export function withoutNeonPooler(url: string): string {
  if (!/^postgres(ql)?:\/\//.test(url)) return url;
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.replace(/-pooler(?=\.)/, "");
  return parsed.toString();
}

/** Throws with every invalid variable listed; callers should let it crash the process. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  const onVercel = e.VERCEL === "1";
  // Every Vercel deployment, previews included, is public: never fall back to dev behaviour
  // (dev outbox with reset links, non-Secure cookies) because NODE_ENV was left unset.
  const runtimeEnv = onVercel ? "production" : e.NODE_ENV;
  const isProduction = runtimeEnv === "production";
  const secret = e.JWT_SECRET?.trim() || undefined;

  if (secret !== undefined && secret.length < 32) {
    throw new Error("Invalid environment: JWT_SECRET must be at least 32 characters");
  }
  if (isProduction && secret === undefined) {
    throw new Error("Invalid environment: JWT_SECRET is required in production");
  }

  const databaseUrl = e.DATABASE_URL || undefined;
  const blob =
    e.BLOB_READ_WRITE_TOKEN || e.BLOB_STORE_ID ? { token: e.BLOB_READ_WRITE_TOKEN || null } : null;
  // The function disk is ephemeral and per instance: a local database or upload dir would silently lose data.
  if (onVercel && !/^postgres(ql)?:\/\//.test(databaseUrl ?? "")) {
    throw new Error("Invalid environment: on Vercel DATABASE_URL must be a postgres:// (Neon) URL");
  }
  if (onVercel && !blob) {
    throw new Error("Invalid environment: on Vercel connect a Blob store (BLOB_READ_WRITE_TOKEN)");
  }
  // The Vercel Upstash integration names these KV_REST_API_*, optionally behind a custom prefix.
  const upstashUrl =
    e.UPSTASH_REDIS_REST_URL || e.UPSTASH_REDIS_KV_REST_API_URL || e.KV_REST_API_URL || undefined;
  const upstashToken =
    e.UPSTASH_REDIS_REST_TOKEN ||
    e.UPSTASH_REDIS_KV_REST_API_TOKEN ||
    e.KV_REST_API_TOKEN ||
    undefined;
  if (Boolean(upstashUrl) !== Boolean(upstashToken)) {
    throw new Error(
      "Invalid environment: set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
    );
  }
  const webOrigin =
    e.WEB_ORIGIN ??
    (onVercel && e.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:5173");

  return {
    env: runtimeEnv,
    isProduction,
    version: pkg.version,
    port: e.PORT,
    databaseUrl,
    blob,
    upstash: upstashUrl && upstashToken ? { url: upstashUrl, token: upstashToken } : null,
    onVercel,
    receiptMaxBytes: onVercel ? VERCEL_RECEIPT_MAX_BYTES : RECEIPT_MAX_BYTES,
    uploadDir: e.UPLOAD_DIR,
    jwtSecret: secret ?? randomBytes(48).toString("base64url"),
    jwtSecretEphemeral: secret === undefined,
    webOrigin: new URL(webOrigin).origin,
    // Vercel's edge is the single proxy in front of every function.
    trustProxy: parseTrustProxy(e.TRUST_PROXY ?? (onVercel ? "1" : "false")),
    logLevel: e.LOG_LEVEL,
    rateLimit: {
      global: e.RATE_LIMIT_GLOBAL,
      auth: e.RATE_LIMIT_AUTH,
      feedback: e.RATE_LIMIT_FEEDBACK,
    },
    refreshReuseGraceMs: e.REFRESH_REUSE_GRACE_MS,
    webDistDir: e.WEB_DIST_DIR || null,
    smtpUrl: e.SMTP_URL || null,
    mailFrom: e.MAIL_FROM,
    feedbackTo: e.FEEDBACK_TO,
  };
}
