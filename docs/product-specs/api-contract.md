# API contract (v1)

Base path: `/api/v1`. JSON in and out unless noted. Types live in `@ponto/shared` (`packages/shared/src/domain.ts`), request validation in `packages/shared/src/schemas.ts`. Both apps import them; never redefine shapes locally.

Conventions:

- Money is integer cents (`amountCents`, `rateCents`). Dates are `YYYY-MM-DD`, months `YYYY-MM`, clock times `HH:MM` (24h), timestamps ISO-8601 UTC.
- "Today" is computed in the household timezone (`DEFAULT_TIMEZONE`, America/Sao_Paulo) with `nowInZone`.
- Errors: HTTP status + `{ "error": { "code": string, "message": string, "details"?: unknown } }` (`ApiErrorBody`). Messages are pt-BR, user-facing. Codes: `VALIDATION`, `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `ACCOUNT_LOCKED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA`, `INTERNAL`.
- Validation failures return 400 with `details` = zod flattened field errors `{ fieldErrors: Record<string,string[]>, formErrors: string[] }`.
- IDs are opaque strings (random, URL-safe). Never sequential.
- Resources the caller cannot see return 404 (not 403) so existence is not leaked. 403 is for "you can see it but your role cannot do this".

## Auth

Access token: JWT (HS256 via `jose`), 15 min, claims `{ sub, role, tv }` where `tv` = user token version (bumped on password change / logout-all, invalidates outstanding access tokens). Sent as `Authorization: Bearer <token>`. The web app keeps it in memory only.

Refresh token: opaque random 256-bit, stored hashed (SHA-256) server-side, 30 days, rotated on every use. Cookie `ponto_rt`: `HttpOnly; SameSite=Strict; Path=/api/v1/auth; Secure` (Secure off only when `NODE_ENV !== "production"`). Reuse of a rotated token revokes the whole token family. Every request to `/auth/refresh` and `/auth/logout` must carry header `X-Requested-With: ponto` (CSRF defence in addition to SameSite).

| Method | Path                    | Body                   | Response                                                                                                                                                                                                   |
| ------ | ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`        | `registerSchema`       | 201 `{ accessToken, user: PublicUser }` + refresh cookie. Employers get a household "Minha casa" created. Workers with a valid `inviteCode` are linked to that contract. Duplicate email → 409 `CONFLICT`. |
| POST   | `/auth/login`           | `loginSchema`          | 200 `{ accessToken, user }` + cookie. Wrong credentials → 401 generic message. 5 consecutive failures lock the account 15 min → 423 `ACCOUNT_LOCKED`.                                                      |
| POST   | `/auth/refresh`         | –                      | 200 `{ accessToken, user }` + rotated cookie. 401 if missing/invalid.                                                                                                                                      |
| POST   | `/auth/logout`          | –                      | 204, revokes current refresh family, clears cookie.                                                                                                                                                        |
| POST   | `/auth/logout-all`      | – (auth)               | 204, revokes all refresh tokens, bumps token version.                                                                                                                                                      |
| POST   | `/auth/forgot-password` | `forgotPasswordSchema` | 204 always. Sends reset link through the mailer (dev: logged + `GET /dev/outbox`). Token 30 min, single use, stored hashed.                                                                                |
| POST   | `/auth/reset-password`  | `resetPasswordSchema`  | 204. Revokes all sessions.                                                                                                                                                                                 |

## Me

| Method | Path           | Body                   | Response                                                                     |
| ------ | -------------- | ---------------------- | ---------------------------------------------------------------------------- |
| GET    | `/me`          | –                      | `{ user: PublicUser }`                                                       |
| PATCH  | `/me`          | `updateMeSchema`       | `{ user }`                                                                   |
| POST   | `/me/password` | `changePasswordSchema` | 204, revokes other sessions, returns new cookie + `{ accessToken }` with 200 |

## Households (employer)

| Method | Path              | Body              | Response                      |
| ------ | ----------------- | ----------------- | ----------------------------- |
| GET    | `/households`     | –                 | `{ households: Household[] }` |
| POST   | `/households`     | `householdSchema` | 201 `{ household }`           |
| PATCH  | `/households/:id` | `householdSchema` | `{ household }`               |

## Contracts (vínculos)

Employer sees contracts of households they own. Worker sees contracts where `workerId = me`.

Every `Contract` carries `workerPhone` and `workerPixKey`, read live from the linked worker's profile (`PATCH /me`); both are `null` while no worker is linked.

| Method | Path                    | Who      | Body                                                             | Response                                                                                                                                                                            |
| ------ | ----------------------- | -------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/contracts`            | both     | –                                                                | `{ contracts: Contract[] }`                                                                                                                                                         |
| POST   | `/contracts`            | employer | `createContractSchema` (householdId defaults to first household) | 201 `{ contract }`                                                                                                                                                                  |
| GET    | `/contracts/:id`        | both     | –                                                                | `{ contract }`                                                                                                                                                                      |
| PATCH  | `/contracts/:id`        | employer | `updateContractSchema`                                           | `{ contract }`                                                                                                                                                                      |
| POST   | `/contracts/:id/end`    | employer | `endContractSchema`                                              | `{ contract }`                                                                                                                                                                      |
| POST   | `/contracts/:id/invite` | employer | –                                                                | `{ code: string, expiresAt: string }` 8-char code from alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 7 days, regenerating invalidates the old one. 409 if a worker is already linked. |
| POST   | `/contracts/join`       | worker   | `joinContractSchema`                                             | `{ contract }`. Invalid/expired → 404.                                                                                                                                              |

## Work entries (dias)

One entry per contract per date. Either party can create/edit. The entry is confirmed when the _other_ party confirms it. Editing a confirmed entry clears confirmation. `minutes` is derived server-side with `shiftMinutes` (0 if not worked or missing checkOut).

| Method | Path                                   | Body                | Response                                                                                                                                                                       |
| ------ | -------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/contracts/:id/entries?month=YYYY-MM` | –                   | `{ entries: WorkEntry[] }` sorted by date                                                                                                                                      |
| PUT    | `/contracts/:id/entries/:date`         | `upsertEntrySchema` | `{ entry }` (201 when created). Dates before `startedOn` or after `endedOn` → 400. Future dates allowed only for status `day_off`/`holiday`/`excused`.                         |
| DELETE | `/contracts/:id/entries/:date`         | –                   | 204. Only creator, and only if not confirmed (employer may always delete).                                                                                                     |
| POST   | `/contracts/:id/entries/:date/confirm` | –                   | `{ entry }`. 403 if caller created it.                                                                                                                                         |
| POST   | `/contracts/:id/clock`                 | `clockSchema`       | `{ entry }`. `in`: creates/updates today's entry status `worked`, `checkIn = now`. 409 if already checked in. `out`: sets `checkOut = now`. 409 if no check-in or already out. |

## Adjustments (extras, vales, descontos) – employer writes, both read

| Method | Path                                | Body                     | Response                        |
| ------ | ----------------------------------- | ------------------------ | ------------------------------- |
| GET    | `/contracts/:id/adjustments?month=` | –                        | `{ adjustments: Adjustment[] }` |
| POST   | `/contracts/:id/adjustments`        | `createAdjustmentSchema` | 201 `{ adjustment }`            |
| DELETE | `/contracts/:id/adjustments/:adjId` | –                        | 204                             |

## Payments + receipts

| Method | Path                                       | Who      | Body                                                                                   | Response                                                                                                                                                                                 |
| ------ | ------------------------------------------ | -------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/contracts/:id/payments?year=YYYY`        | both     | –                                                                                      | `{ payments: Payment[] }` newest first                                                                                                                                                   |
| POST   | `/contracts/:id/payments`                  | employer | `multipart/form-data`: fields of `createPaymentSchema` + optional file field `receipt` | 201 `{ payment }`                                                                                                                                                                        |
| PUT    | `/contracts/:id/payments/:pid/receipt`     | employer | multipart file `receipt`                                                               | `{ payment }` (replaces)                                                                                                                                                                 |
| GET    | `/contracts/:id/payments/:pid/receipt`     | both     | –                                                                                      | file stream, `Content-Type` from stored mime, `Content-Disposition: inline; filename="comprovante-<month>.<ext>"`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` |
| DELETE | `/contracts/:id/payments/:pid`             | employer | –                                                                                      | 204 (also deletes file)                                                                                                                                                                  |
| POST   | `/contracts/:id/payments/:pid/acknowledge` | worker   | –                                                                                      | `{ payment }` "recebi"                                                                                                                                                                   |

Receipt rules: max `RECEIPT_MAX_BYTES` (5 MB), type detected from magic bytes (not the client mime) and must be in `RECEIPT_MIME_TYPES`; stored outside any static dir under a random filename; original filename sanitised and kept only for display.

## Summary, statement, activity, dashboard

| Method | Path                                  | Response                                                                                                                                                        |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/contracts/:id/summary?month=`       | `{ summary: MonthSummary }` computed with `computeMonthSummary` (payments filtered by `referenceMonth`)                                                         |
| GET    | `/contracts/:id/statement.csv?month=` | `text/csv; charset=utf-8` with BOM, `;` separator (Excel pt-BR), one row per day + totals. Cells starting with `= + - @` are prefixed with `'` (CSV injection). |
| GET    | `/contracts/:id/activity?limit=50`    | `{ activity: ActivityItem[] }` newest first                                                                                                                     |
| GET    | `/dashboard`                          | `{ items: DashboardItem[], month: YearMonth, today: IsoDate }` current month for every active contract the caller can see                                       |

## Health

`GET /api/health` → `{ status: "ok", db: "ok", version }` (no auth).
