# Architecture

## System diagram

```
  Browser (PWA, Vue 3.5)                     Server (Node 24)
 +-------------------------+   HTTPS    +--------------------------------------+
 | views                   |  /api/v1   | server.ts | vercel.ts  (entries)     |
 |  components/{ui,feature}| ---------> | runtime.ts (wiring, boot checks)     |
 |  composables            |  Bearer    |  http  (routes, middleware)          |
 |  stores (Pinia)         |  + cookie  |  services (business rules)           |
 |  api (fetch client)     | <--------- |  repos (Drizzle queries)             |
 | service worker (cache)  |            |  db (Drizzle: PGlite|node-postgres)  |
 +-------------------------+            +-------------------+------------------+
            ^             PGlite / Postgres + uploads dir  |  or  Neon + Vercel Blob
            |  both import types, schemas, RBAC, pay math
            +------------------ @emdia/shared ------------------+
```

## Packages and dependency direction

- `packages/shared` (`@emdia/shared`): domain types, zod schemas, RBAC, pay math, time helpers. Depends only on `zod`.
- `apps/api` and `apps/web` depend on `@emdia/shared`. They never import each other.
- `tools/harness` reads source files as text; it imports nothing from the apps.

```
apps/web ---> packages/shared <--- apps/api
```

Enforced by `tools/harness/tests/architecture.test.ts`.

## API layering

Source is under `apps/api/src`:

| Dir          | Responsibility                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `config`     | Env parsing and validation, one frozen config object                                                                   |
| `db`         | Drizzle schema (`schema.ts`), drivers (PGlite, node-postgres), migrator under an advisory lock                         |
| `repos`      | SQL only. One repo per table group. Returns plain objects                                                              |
| `services`   | Business rules, RBAC checks, transactions, audit log writes                                                            |
| `http`       | Express routers, middleware, request parsing, error mapping                                                            |
| `lib`        | Pure helpers: ids, hashing, logger, mailer, errors, csv                                                                |
| `runtime.ts` | Opens the database, migrates embedded PGlite (only reports pending migrations on Postgres), wires services and the app |
| `server.ts`  | Long-running entry: `startRuntime`, listen, graceful shutdown                                                          |
| `vercel.ts`  | Vercel Function entry: one runtime per instance, restores the rewritten URL ([deploy](DEPLOY-VERCEL.md))               |

Rules:

- Imports flow `http -> services -> repos -> db`. A layer may skip down (http may call repos for trivial reads) but never up.
- `config` and `lib` may be imported by any layer.
- Entrypoints are `server.ts`, `runtime.ts`, `vercel.ts` and `scripts/`. They are composition roots and may import any layer, including `http`. No layer imports an entrypoint, and nothing else imports `http`. The harness enforces both.
- Every database call is async and goes through the Drizzle query builder in `repos`. A write that spans statements runs in `repos.tx(async (r) => …)` and uses only the transaction's repositories `r`. Repos return the `@emdia/shared` domain types exactly (`tests/repo-types.test.ts` proves it at compile time). See [Drizzle/Postgres notes](references/drizzle-postgres.md).
- Receipts go through the `FileStore` interface: disk (`UPLOAD_DIR`) or a private Vercel Blob store. Both are streamed by the API after the auth check; storage URLs never reach the browser.
- `repos`, `services`, `db` and `config` never import `express` or other HTTP libraries. Services take plain values and throw `AppError`; `http` maps errors to the `ApiErrorBody` shape.
- Every route parses params, query and body with a schema from `@emdia/shared` before calling a service.

## Web layering

Source is under `apps/web/src`:

`api -> stores -> composables -> components/{ui,feature} -> views`

- `api`: typed fetch client, plus the query cache options and query key factories (`query.ts`, `keys.ts`). Holds nothing but request and cache logic and the in-memory access token hook. The cache itself is Pinia Colada's `_pc_query` Pinia store, installed in `main.ts`.
- `stores`: Pinia stores. Call `api`, expose state and actions. The auth store empties the query cache on logout through `useQueryCache()` and `clearQueryCache` from `api/query.ts`.
- `composables`: reusable logic over stores (month navigation, clock, install prompt).
- `components/ui`: presentational primitives (button, sheet, month switcher). Props in, events out. They never import `stores`, `api` or `pinia`.
- `components/feature`: domain components (time card, payment stub). May use stores and composables.
- `views`: route-level pages that compose feature components.

A layer imports only from layers to its left.

## Auth design

- Access token: JWT HS256 (`jose`), 15 minutes, claims `sub`, `role`, `tv`. Kept in memory only (Pinia). `tv` is the user's token version; bumping it invalidates all outstanding access tokens.
- Refresh token: opaque 256-bit random, stored as SHA-256 hash, 30 days, in the `emdia_rt` cookie (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` in production). Rotated on every use. Reusing a rotated token revokes its whole family.
- CSRF: `/auth/refresh` and `/auth/logout` require `X-Requested-With: emdia` on top of `SameSite=Strict`.
- On page load the web app calls `/auth/refresh` to get an access token. On a 401 `TOKEN_EXPIRED` it refreshes once and retries.
- Full endpoint behavior: [api-contract](product-specs/api-contract.md#auth). Controls checklist: [SECURITY](SECURITY.md).

## Data model overview

Generated column detail: [generated/db-schema.md](generated/README.md).

- `users`: email, password hash (scrypt), role, name, phone, Pix key, token version, lockout counters.
- `households`: owned by an employer user; has a timezone.
- `contracts`: household + worker (nullable until the invite is used), occupation, pay type, rate in cents, expected times, start and end dates, status, and the agreed schedule: `schedule_kind` (`weekly`, `month_days`, `per_month`, `on_demand`), `schedule_weekdays` (JSON), `every_weeks` (1 to 4), `month_days` (JSON), `visits_per_month`, plus `deduct_absences` (monthly pay only). Schedule logic lives in `packages/shared/src/schedule.ts`; migration 003 converted the old weekday list. Migration 004 added `archived_at` (logical removal), `contact_email` and `contact_phone` (typed by the employer before the worker has an account).
- `work_entries`: one per contract per date. Status, check-in/out, break, derived minutes, creator, confirmer.
- `payments.kind` (pay, bonus, transport, advance, deduction) replaces the old `adjustments` table (dropped in migration 0003); `payments.advance_id` links an abatement to its adiantamento.
- `agreements`: contract, description, total and installment in cents, start month, accepted/cancelled timestamps.
- `payments`: contract, optional agreement, reference month, paid date, amount in cents, method, receipt metadata (stored filename, mime, size, display name), acknowledged-at.
- `refresh_tokens`: hashed token, family id, expiry, revoked-at, replaced-by.
- `password_resets`: hashed token, expiry, used-at.
- `invites`: contract, code hash or code, expiry, used-at.
- `audit_log`: actor, contract, action, target, JSON detail, timestamp. Feeds the activity endpoint.

## Team endpoint and mail

- `GET /team?month=` returns one `DashboardItem` (contract plus that month's summary) per visible contract, so the team table, board and payments views load in one request. Archived contracts appear only with `include=archived`.
- Archived contracts are read-only; services reject writes with 409 `CONFLICT`.
- The mailer (`lib/mailer.ts`) sends through SMTP via nodemailer when `SMTP_URL` is set. Outside production it also keeps the last 50 messages in memory, served at `/api/v1/dev/outbox`. In production without `SMTP_URL` it logs a warning at startup and drops messages (the send reports failure, and the invite view falls back to showing the code).
- Invites carry a `signupUrl` and, when a phone is known, a `wa.me` link. The server never sends WhatsApp messages.
- Migration 005 adds `agreements` (description, total, optional installment, start month, accepted-at, cancelled-at) and `payments.agreement_id`. An agreement installment is a payment with method `compensation`; remaining and settled amounts are derived, not stored.
- New permissions in `@emdia/shared` RBAC: `agreement:write` (employer), `agreement:accept` (worker) and `account:delete` (both).
- Account deletion (`DELETE /me`) anonymises the user instead of removing the row, so contracts, entries and payments keep their foreign keys. See [SECURITY](SECURITY.md#account-deletion-and-lgpd).
- `/dashboard` and `/team` return `estimate` for any month, including future ones.
- Cost estimates (`estimateMonthCost`, `estimateAverageMonthlyCost`) live in `packages/shared/src/estimate.ts`.

## Cross-cutting rules

- Money is integer cents everywhere. Dates are `YYYY-MM-DD`, months `YYYY-MM`, times `HH:MM`, timestamps ISO-8601 UTC.
- "Today" comes from `nowInZone(DEFAULT_TIMEZONE)`.
- IDs are random and URL-safe, never sequential.
- Invisible resources return 404; 403 only when the caller can see the resource but their role cannot act.
