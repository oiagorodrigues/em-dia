# Reliability

## Data and backups

State is a database plus receipt files. Two deployments exist:

| Deployment                         | Database                          | Receipts                  |
| ---------------------------------- | --------------------------------- | ------------------------- |
| Docker / `bun run start`           | SQLite file via `node:sqlite`     | `UPLOAD_DIR` on disk      |
| Vercel ([guide](DEPLOY-VERCEL.md)) | Turso (libSQL) via `DATABASE_URL` | private Vercel Blob store |

SQLite file deployments: back up the file and the uploads directory together.

- Use `VACUUM INTO 'backup.db'` or the SQLite online backup API for a consistent copy while the server runs. Do not `cp` a live WAL database.
- Copy the uploads directory after the database snapshot; a missing file for a recorded receipt answers 404 "Comprovante indisponível", it does not crash.
- Keep at least 7 daily copies. Test a restore by starting the api against the copy and calling `/api/health`.

Turso and Blob: Turso keeps point-in-time recovery (window depends on the plan); keep your own `.dump` too. Blob has no built-in backup; copy `receipts/` with `vercel blob list`/`get`. Commands are in [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md#backups).

Migrations are SQL scripts applied in order, once each, each in its own write transaction that re-checks the `migrations` table, so concurrent runs are safe. A local SQLite file migrates at startup. A remote (Turso) database is migrated only by `bun run db:migrate`, which the Vercel build runs; at boot the API logs an error listing pending migrations instead of migrating from many instances at once. Never edit a shipped migration; add a new one.

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

| Failure                  | Expected behavior                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Database locked          | SQLite file: `busy_timeout`, then 500. Turso: write transactions are queued per instance and retried on `SQLITE_BUSY` with backoff, then 500 |
| Schema behind (Turso)    | Boot logs `database schema is behind` with the pending ids; run `bun run db:migrate`                                                         |
| Blob store unavailable   | Payment with receipt fails with 500 and no row is written; downloads return 500                                                              |
| Upstash unavailable      | Rate limiting lets requests through (`passOnStoreError`) instead of failing them                                                             |
| Uploads dir not writable | Payment creation fails with 500 before inserting the row                                                                                     |
| Clock skew               | Server time is the only source for clock in/out                                                                                              |
| Mailer unavailable       | Forgot-password still returns 204; invites return `emailSent: false`; failure logged                                                         |

## Deploy

Vercel (serverless, Turso, Blob): see [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). The rest of this section is the single-process deployment.

One process serves the API and the built PWA from the same origin. Same origin is what lets the refresh cookie (`SameSite=Strict`) and the service worker work without CORS.

- Local production run: `bun run build`, then `bun run start` (sets `WEB_DIST_DIR=../web/dist` and runs `apps/api/dist/server.mjs`).
- Container: `docker build -t emdia .` then `docker run -p 3000:3000 -v emdia-data:/data -e JWT_SECRET=… -e WEB_ORIGIN=https://your.host -e TRUST_PROXY=1 emdia`. It runs as the non-root `node` user, keeps state in the `/data` volume (`DATABASE_PATH=/data/emdia.db`, `UPLOAD_DIR=/data/uploads`) and reports health from `/api/health`.
- Required in production: `JWT_SECRET` (≥ 32 chars; the process refuses to start without it). Set `WEB_ORIGIN` to the public URL (reset links) and `TRUST_PROXY` to the number of proxies in front so rate limits see client IPs.
- Mail: set `SMTP_URL` (`smtps://user:pass@host:465`) and `MAIL_FROM` for invites and password resets. Without `SMTP_URL` the production server logs a warning at boot, drops mail, and invites come back with `emailSent: false` (the employer can still share the link or WhatsApp). Outside production every message is also kept in `GET /api/v1/dev/outbox`.
- Terminate TLS at the proxy. HSTS is sent in production.
- Caching: `/assets/*` is fingerprinted and served `immutable` for a year. `index.html`, `sw.js`, `workbox-*.js` and `manifest.webmanifest` are `no-cache`, so a deploy reaches clients on their next load. API responses are `no-store`.
- Navigations (`Accept: text/html`) outside `/api` fall back to `index.html`. Other misses are 404.
