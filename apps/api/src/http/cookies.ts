import type { CookieOptions, Request, Response } from "express";
import type { Config } from "../config/index.ts";

export const REFRESH_COOKIE = "ponto_rt";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const options = (config: Config): CookieOptions => ({
  httpOnly: true,
  sameSite: "strict",
  path: "/api/v1/auth",
  secure: config.isProduction,
});

export function setRefreshCookie(res: Response, config: Config, token: string): void {
  res.cookie(REFRESH_COOKIE, token, { ...options(config), maxAge: MAX_AGE_MS });
}

export function clearRefreshCookie(res: Response, config: Config): void {
  res.clearCookie(REFRESH_COOKIE, options(config));
}

export function refreshCookieOf(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
