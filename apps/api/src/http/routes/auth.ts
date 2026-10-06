import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@emdia/shared";
import { Router, type RequestHandler, type Response } from "express";
import type { Config } from "../../config/index.ts";
import type { Services, Session } from "../../services/index.ts";
import { actorOf } from "../context.ts";
import { clearRefreshCookie, refreshCookieOf, setRefreshCookie } from "../cookies.ts";
import { authenticate, requireCsrfHeader } from "../middleware/auth.ts";
import { parse } from "../validate.ts";

export function authRoutes(
  services: Services,
  config: Config,
  authLimiter: RequestHandler,
): Router {
  const router = Router();
  const { auth } = services;

  const sendSession = (res: Response, session: Session, status = 200) => {
    setRefreshCookie(res, config, session.refreshToken);
    res.status(status).json({ accessToken: session.accessToken, user: session.user });
  };

  router.post("/auth/register", authLimiter, async (req, res) => {
    sendSession(res, await auth.register(parse(registerSchema, req.body)), 201);
  });

  router.post("/auth/login", authLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    sendSession(res, await auth.login(email, password));
  });

  router.post("/auth/refresh", requireCsrfHeader, async (req, res) => {
    try {
      sendSession(res, await auth.refresh(refreshCookieOf(req)));
    } catch (err) {
      clearRefreshCookie(res, config);
      throw err;
    }
  });

  router.post("/auth/logout", requireCsrfHeader, (req, res) => {
    auth.logout(refreshCookieOf(req));
    clearRefreshCookie(res, config);
    res.status(204).end();
  });

  router.post("/auth/logout-all", authenticate(services), (_req, res) => {
    auth.logoutAll(actorOf(res));
    clearRefreshCookie(res, config);
    res.status(204).end();
  });

  router.post("/auth/forgot-password", authLimiter, async (req, res) => {
    await auth.forgotPassword(parse(forgotPasswordSchema, req.body).email);
    res.status(204).end();
  });

  router.post("/auth/reset-password", authLimiter, async (req, res) => {
    const { token, password } = parse(resetPasswordSchema, req.body);
    await auth.resetPassword(token, password);
    clearRefreshCookie(res, config);
    res.status(204).end();
  });

  router.post("/me/password", authenticate(services), async (req, res) => {
    const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
    const session = await auth.changePassword(actorOf(res), currentPassword, newPassword);
    setRefreshCookie(res, config, session.refreshToken);
    res.json({ accessToken: session.accessToken });
  });

  return router;
}
