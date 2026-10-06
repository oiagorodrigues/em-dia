import type { ApiErrorBody, PublicUser } from "@emdia/shared";

export const API_BASE = "/api/v1";

const FALLBACK_MESSAGE: Record<string, string> = {
  NETWORK: "Sem conexão com o servidor. Verifique sua internet e tente de novo.",
  UNAUTHENTICATED: "Sua sessão expirou. Entre de novo.",
  TOKEN_EXPIRED: "Sua sessão expirou. Entre de novo.",
  FORBIDDEN: "Você não tem permissão para isso.",
  NOT_FOUND: "Não encontramos o que você procurava.",
  CONFLICT: "Isso entrou em conflito com outro registro.",
  RATE_LIMITED: "Muitas tentativas. Espere um pouco e tente de novo.",
  ACCOUNT_LOCKED: "Conta bloqueada por alguns minutos após muitas tentativas.",
  PAYLOAD_TOO_LARGE: "Arquivo grande demais.",
  UNSUPPORTED_MEDIA: "Tipo de arquivo não aceito.",
  VALIDATION: "Confira os campos destacados.",
  INTERNAL: "Algo deu errado do nosso lado. Tente de novo em instantes.",
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message || FALLBACK_MESSAGE[code] || FALLBACK_MESSAGE.INTERNAL);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.fieldErrors = extractFieldErrors(details);
  }
}

function extractFieldErrors(details: unknown): Record<string, string[]> {
  if (!details || typeof details !== "object" || !("fieldErrors" in details)) return {};
  const raw = (details as { fieldErrors: unknown }).fieldErrors;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) out[key] = value.filter((v): v is string => typeof v === "string");
  }
  return out;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return FALLBACK_MESSAGE.INTERNAL!;
}

export interface Session {
  accessToken: string;
  user: PublicUser;
}

interface AuthHooks {
  onSession: (session: Session) => void;
  onSessionLost: () => void;
}

let accessToken: string | null = null;
let hooks: AuthHooks = { onSession: () => {}, onSessionLost: () => {} };
let refreshing: Promise<Session | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function configureAuthHooks(next: AuthHooks): void {
  hooks = next;
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const err = body?.error;
  if (err && typeof err.code === "string")
    return new ApiError(res.status, err.code, err.message, err.details);
  const code =
    res.status === 404 ? "NOT_FOUND" : res.status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL";
  return new ApiError(res.status, code, "");
}

type AuthMessage = { type: "session"; session: Session; at: number } | { type: "logout" };

const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("emdia-auth");
/** Most recent session obtained by this tab or announced by another one. */
let latest: { session: Session; at: number } | null = null;

channel?.addEventListener("message", (e: MessageEvent<AuthMessage>) => {
  const msg = e.data;
  if (msg.type === "session") {
    latest = { session: msg.session, at: msg.at };
    accessToken = msg.session.accessToken;
    hooks.onSession(msg.session);
  } else if (msg.type === "logout") {
    latest = null;
    accessToken = null;
    hooks.onSessionLost();
  }
});

/** Tells other open tabs this session ended, so they drop their in-memory token too. */
export function announceLogout(): void {
  latest = null;
  accessToken = null;
  channel?.postMessage({ type: "logout" } satisfies AuthMessage);
}

function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request("emdia-refresh", fn) : fn();
}

/**
 * Single-flight within the tab (concurrent 401s share one promise) and across
 * tabs (Web Locks). The refresh cookie rotates on every use and the API treats
 * two refreshes with the same cookie as token theft, revoking the session; so a
 * tab that waited on the lock reuses the session another tab just obtained.
 */
export function refreshSession(): Promise<Session | null> {
  const requestedAt = Date.now();
  refreshing ??= withRefreshLock(async () => {
    if (latest && latest.at > requestedAt) {
      accessToken = latest.session.accessToken;
      return latest.session;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "emdia" },
      });
      if (!res.ok) return null;
      const session = (await res.json()) as Session;
      latest = { session, at: Date.now() };
      accessToken = session.accessToken;
      hooks.onSession(session);
      channel?.postMessage({ type: "session", session, at: latest.at } satisfies AuthMessage);
      return session;
    } catch {
      return null;
    }
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export type Query = Record<string, string | number | undefined | null>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Send the bearer token and try a refresh on 401. Default true. */
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: Query): string {
  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== null) params.set(k, String(v));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body,
      credentials: "include",
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK", "");
  }
}

async function sendAuthorized(path: string, opts: RequestOptions): Promise<Response> {
  const res = await send(path, opts);
  if (res.ok) return res;
  const err = await toApiError(res);
  if (res.status !== 401 || opts.auth === false) throw err;
  // Only an expired access token is worth a refresh; anything else means the session is gone.
  if (err.code === "TOKEN_EXPIRED") {
    const session = await refreshSession();
    if (session) {
      const retry = await send(path, opts);
      if (retry.ok) return retry;
      const retryErr = await toApiError(retry);
      if (retry.status === 401) loseSession();
      throw retryErr;
    }
  }
  loseSession();
  throw err;
}

function loseSession(): void {
  accessToken = null;
  latest = null;
  hooks.onSessionLost();
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await sendAuthorized(path, opts);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("Content-Type") ?? "";
  if (!type.includes("json")) return undefined as T;
  return (await res.json()) as T;
}

export interface DownloadedFile {
  blob: Blob;
  filename: string | null;
}

export async function requestBlob(
  path: string,
  opts: RequestOptions = {},
): Promise<DownloadedFile> {
  const res = await sendAuthorized(path, { ...opts, headers: { Accept: "*/*", ...opts.headers } });
  return {
    blob: await res.blob(),
    filename: filenameFromDisposition(res.headers.get("Content-Disposition")),
  };
}

export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return sanitizeFilename(decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")));
    } catch {
      /* fall through to plain filename */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ? sanitizeFilename(plain[1]) : null;
}

const UNSAFE_FILENAME_CHARS = '<>:"/\\|?*';

/** Strips path separators and control characters before a name is shown or used for a download. */
export function sanitizeFilename(name: string): string {
  const cleaned = Array.from(name, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 || UNSAFE_FILENAME_CHARS.includes(ch) ? "_" : ch;
  })
    .join("")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "arquivo";
}
