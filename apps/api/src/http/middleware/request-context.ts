import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "../../lib/logger.ts";

const INCOMING_ID_RE = /^[\w-]{8,64}$/;

/** Assigns X-Request-Id (reusing a well-formed incoming one) and logs one line per request. */
export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get("x-request-id");
    const requestId = incoming && INCOMING_ID_RE.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const actor = res.locals.actor as { id: string } | undefined;
      logger.info("request", {
        requestId,
        method: req.method,
        // Path only: query strings are not logged.
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        userId: actor?.id,
      });
    });
    next();
  };
}
