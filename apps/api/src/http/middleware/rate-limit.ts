import { rateLimit, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { ApiErrorBody } from "@emdia/shared";
import type { Config } from "../../config/index.ts";
import { upstashCommand } from "../../lib/upstash.ts";

const WINDOW_MS = 15 * 60 * 1000;

const body: ApiErrorBody = {
  error: {
    code: "RATE_LIMITED",
    message: "Muitas requisições. Aguarde alguns minutos e tente de novo.",
  },
};

/**
 * In-memory counters are per process, which on serverless means per instance:
 * with Upstash configured every instance shares one counter per IP.
 */
export function createRateLimiter(limit: number, name: string, config: Config) {
  const store: Store | undefined = config.upstash
    ? new RedisStore({ sendCommand: upstashCommand(config.upstash), prefix: `rl:${name}:` })
    : undefined;
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: body,
    store,
    // A Redis outage must not take the API down with it.
    passOnStoreError: true,
  });
}
