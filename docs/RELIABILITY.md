# Reliability

## Data and backups

State is one SQLite file plus one uploads directory (`DATA_DIR`). Back up both together.

- Use `VACUUM INTO 'backup.db'` or the SQLite online backup API for a consistent copy while the server runs. Do not `cp` a live WAL database.
- Copy the uploads directory after the database snapshot; a missing file for a recorded receipt must show as "comprovante indisponível", not crash.
- Keep at least 7 daily copies. Test a restore by starting the api against the copy and calling `/api/health`.
- Migrations run on startup inside a transaction, in order, once each (tracked in a migrations table). Never edit a shipped migration; add a new one.

## Health

`GET /api/health` returns `{ status: "ok", db: "ok", version }` without auth. It runs `select 1`. Use it for container and uptime checks.

## Graceful shutdown

On `SIGTERM` and `SIGINT`: stop accepting connections, wait for in-flight requests, close the database, exit 0. If requests are still open after 10 s, or a second signal arrives, the process logs why and exits 1 without waiting.

## Logging

- One JSON line per event from `src/lib/logger.ts`. `console.log` is blocked in api source by the harness.
- Every request gets a request id (from `X-Request-Id` if valid, else random), echoed in the `X-Request-Id` response header and included in the request log line and in any error logged for that request.
- Redact `authorization`, cookies, passwords, tokens and reset links. The one exception is the dev mailer, which logs reset links on purpose; production never uses it.
- Log level from `LOG_LEVEL`. Errors that become 500 log the stack with the request id; clients get `INTERNAL` with a generic message, and the id is in the `X-Request-Id` header for support.

## Failure modes

| Failure                  | Expected behavior                                                |
| ------------------------ | ---------------------------------------------------------------- |
| Database locked          | `busy_timeout` set; request fails with 500 after timeout, logged |
| Uploads dir not writable | Payment creation fails with 500 before inserting the row         |
| Clock skew               | Server time is the only source for clock in/out                  |
| Mailer unavailable       | Forgot-password still returns 204; failure logged                |

## Deploy

One process serves the API and the built PWA from the same origin. Same origin is what lets the refresh cookie (`SameSite=Strict`) and the service worker work without CORS.

- Local production run: `bun run build`, then `bun run start` (sets `WEB_DIST_DIR=../web/dist` and runs `apps/api/dist/server.mjs`).
- Container: `docker build -t emdia .` then `docker run -p 3000:3000 -v emdia-data:/data -e JWT_SECRET=… -e WEB_ORIGIN=https://your.host -e TRUST_PROXY=1 emdia`. It runs as the non-root `node` user, keeps state in the `/data` volume (`DATABASE_PATH=/data/emdia.db`, `UPLOAD_DIR=/data/uploads`) and reports health from `/api/health`.
- Required in production: `JWT_SECRET` (≥ 32 chars; the process refuses to start without it). Set `WEB_ORIGIN` to the public URL (reset links) and `TRUST_PROXY` to the number of proxies in front so rate limits see client IPs.
- Terminate TLS at the proxy. HSTS is sent in production.
- Caching: `/assets/*` is fingerprinted and served `immutable` for a year. `index.html`, `sw.js`, `workbox-*.js` and `manifest.webmanifest` are `no-cache`, so a deploy reaches clients on their next load. API responses are `no-store`.
- Navigations (`Accept: text/html`) outside `/api` fall back to `index.html`. Other misses are 404.
