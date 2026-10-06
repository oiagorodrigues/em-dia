import type { RequestHandler } from "express";
import helmet from "helmet";

type Directives = Record<string, string[]>;

/** JSON and file responses never need to load anything. */
const API_CSP: Directives = {
  defaultSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
};

/**
 * The built PWA: everything same-origin, no inline script or style. Vue's
 * :style bindings write through CSSOM, which CSP does not govern.
 */
const WEB_CSP: Directives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", "blob:", "data:"],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  objectSrc: ["'none'"],
};

function securityHeaders(directives: Directives, isProduction: boolean): RequestHandler {
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives },
    crossOriginResourcePolicy: { policy: "same-origin" },
    strictTransportSecurity: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
}

export const isApiPath = (path: string) => path === "/api" || path.startsWith("/api/");

/** Strict API policy under /api; the PWA policy elsewhere when the web app is served. */
export function createSecurityHeaders(opts: {
  isProduction: boolean;
  servesWeb: boolean;
}): RequestHandler {
  const api = securityHeaders(API_CSP, opts.isProduction);
  const web = opts.servesWeb ? securityHeaders(WEB_CSP, opts.isProduction) : api;
  return (req, res, next) => (isApiPath(req.path) ? api : web)(req, res, next);
}
