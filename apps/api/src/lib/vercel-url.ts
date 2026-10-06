/** Query parameter the `/api/:emdiaPath*` rewrite in vercel.json fills in. */
export const PATH_PARAM = "emdiaPath";

/**
 * vercel.json rewrites `/api/*` to a single function, and Vercel passes named
 * rewrite parameters through the query string. The request may therefore
 * arrive as the original URL or as `/api?emdiaPath=v1/...`; either way Express
 * must see `/api/v1/...` with the client's own query string.
 */
export function restoreOriginalUrl(rawUrl: string): string {
  const url = new URL(rawUrl, "http://function.local");
  const route = url.searchParams.get(PATH_PARAM);
  url.searchParams.delete(PATH_PARAM);
  const atFunctionPath = url.pathname === "/api" || url.pathname === "/api/index";
  const pathname =
    atFunctionPath && route !== null ? `/api/${route.replace(/^\/+/, "")}` : url.pathname;
  return `${pathname}${url.search}`;
}
