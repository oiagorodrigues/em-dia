import type { LogLevel } from "../config/index.ts";

type Fields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const SECRET_KEY_RE = /pass(word)?|secret|token|authorization|cookie|invitecode/i;

/** Defence in depth: callers should not log secrets, but a stray field must not leak one. */
function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Fields = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

export function createLogger(
  level: LogLevel,
  base: Fields = {},
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const threshold = SEVERITY[level];
  const log = (lvl: Exclude<LogLevel, "silent">, msg: string, fields?: Fields) => {
    if (SEVERITY[lvl] < threshold) return;
    const entry = {
      level: lvl,
      time: new Date().toISOString(),
      msg,
      ...base,
      ...(redact(fields ?? {}) as Fields),
    };
    write(JSON.stringify(entry));
  };
  return {
    debug: (msg, fields) => log("debug", msg, fields),
    info: (msg, fields) => log("info", msg, fields),
    warn: (msg, fields) => log("warn", msg, fields),
    error: (msg, fields) => log("error", msg, fields),
    child: (fields) => createLogger(level, { ...base, ...fields }, write),
  };
}
