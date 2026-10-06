import type { RequestHandler } from "express";

const ALLOWED_HEADERS = "Authorization, Content-Type, X-Requested-With, X-Request-Id";
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE";

/** Single allowed origin with credentials; other origins get no CORS headers at all. */
export function cors(allowedOrigin: string): RequestHandler {
  return (req, res, next) => {
    res.vary("Origin");
    if (req.get("origin") !== allowedOrigin) return next();
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "X-Request-Id, Content-Disposition");
    if (req.method !== "OPTIONS") return next();
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
  };
}
