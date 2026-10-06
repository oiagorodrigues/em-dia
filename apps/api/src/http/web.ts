import { existsSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import express, { Router } from "express";
import { isApiPath } from "./middleware/security-headers.ts";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

/** Vite fingerprints everything under assets/; the rest keeps a stable name and must revalidate. */
function cacheControlFor(relativePath: string): string {
  return relativePath.startsWith(`assets${sep}`) ? IMMUTABLE : REVALIDATE;
}

/** Serves the built web app with an SPA fallback to index.html for navigations. */
export function webRoutes(distDir: string): Router {
  const root = resolve(distDir);
  const indexHtml = join(root, "index.html");
  if (!existsSync(indexHtml)) throw new Error(`WEB_DIST_DIR has no index.html: ${root}`);

  const router = Router();
  router.use(
    express.static(root, {
      dotfiles: "ignore",
      index: false,
      redirect: false,
      setHeaders: (res, path) => {
        res.setHeader("Cache-Control", cacheControlFor(relative(root, path)));
      },
    }),
  );

  // Only real navigations get index.html: a missing /assets/x.js must 404, not
  // come back as HTML that a stale service worker could cache as a script.
  router.get(/.*/, (req, res, next) => {
    const wantsHtml = req.get("accept")?.includes("text/html") ?? false;
    if (!wantsHtml || isApiPath(req.path) || req.path.startsWith("/assets/")) return next();
    res.setHeader("Cache-Control", REVALIDATE);
    res.sendFile(basename(indexHtml), { root, dotfiles: "ignore" });
  });
  return router;
}
