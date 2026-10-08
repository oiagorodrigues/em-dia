# API contract (v1)

Base path: `/api/v1`. JSON in and out unless noted. Types live in `@emdia/shared` (`packages/shared/src/domain.ts`), request validation in `packages/shared/src/schemas.ts`. Both apps import them; never redefine shapes locally.

Conventions:

- Money is integer cents (`amountCents`, `rateCents`). Dates are `YYYY-MM-DD`, months `YYYY-MM`, clock times `HH:MM` (24h), timestamps ISO-8601 UTC.
- "Today" is computed in the household timezone (`DEFAULT_TIMEZONE`, America/Sao_Paulo) with `nowInZone`.
- Errors: HTTP status + `{ "error": { "code": string, "message": string, "details"?: unknown } }` (`ApiErrorBody`). Messages are pt-BR, user-facing. Codes: `VALIDATION`, `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `ACCOUNT_LOCKED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA`, `INTERNAL`.
- Validation failures return 400 with `details` = zod flattened field errors `{ fieldErrors: Record<string,string[]>, formErrors: string[] }`.
- IDs are opaque strings (random, URL-safe). Never sequential.
- Resources the caller cannot see return 404 (not 403) so existence is not leaked. 403 is for "you can see it but your role cannot do this".

## Auth

Access token: JWT (HS256 via `jose`), 15 min, claims `{ sub, role, tv }` where `tv` = user token version (bumped on password change / logout-all, invalidates outstanding access tokens). Sent as `Authorization: Bearer <token>`. The web app keeps it in memory only.

Refresh token: opaque random 256-bit, stored hashed (SHA-256) server-side, 30 days, rotated on every use. Cookie `emdia_rt`: `HttpOnly; SameSite=Strict; Path=/api/v1/auth; Secure` (Secure off only when `NODE_ENV !== "production"`). Reuse of a rotated token revokes the whole token family. Every request to `/auth/refresh` and `/auth/logout` must carry header `X-Requested-With: emdia` (CSRF defence in addition to SameSite).

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

Every `Contract` carries `workerEmail`, `workerPhone` and `workerPixKey`, read live from the linked worker's account and profile (`PATCH /me`); all are `null` while no worker is linked. The employer sees them so they can reach the person they pay.

Schedule (`Contract.schedule`, validated by `scheduleSchema`, helpers in `packages/shared/src/schedule.ts`) covers every arrangement a household has:

| `kind`       | Field used               | Examples                                                           |
| ------------ | ------------------------ | ------------------------------------------------------------------ |
| `weekly`     | `weekdays`, `everyWeeks` | 2x por semana, seg a sex, todos os dias (30 dias), quinzenal (2)   |
| `month_days` | `monthDays`              | todo dia 5; dias 1 e 15 (31 falls on the last day of short months) |
| `per_month`  | `visitsPerMonth`         | 1x por mês, 2x por mês, no fixed date                              |
| `on_demand`  | –                        | quando precisar; nothing is expected                               |

`everyWeeks` counts from the Monday-starting week that contains the first scheduled weekday on or after `startedOn`. The schema drops fields that don't belong to the kind. Expected dates feed `MonthSummary.expectedDates`/`unrecordedDates`; `per_month` only sets `expectedDays` (a count). `payType` is `hourly`, `daily`, `shift` (rate per 24h plantão, each stay paid as minutes ÷ 1440 × rate), `biweekly` (rate per quinzena, 2 × rate a month) or `monthly`. With daily pay each worked day earns the diária in proportion to its minutes over the agreed times less the same break (`workedDayCents`); without agreed times, or before the check-out, it earns one whole diária. `deductAbsences` (salaried pay only: `monthly`, `biweekly`) subtracts `round(monthly salary / 30)` per unjustified absence (`MonthSummary.absenceDeductionCents`). A PATCH replaces `schedule` as a whole.

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

`checkOutDate` (optional, `YYYY-MM-DD`) marks a stay that ends on a later date: it must be after the entry's date, at most `MAX_STAY_DAYS` (7) later and not after today, and needs `checkOut`. `minutes` counts the whole stay less the break. An entry can't start on a day another stay runs through, and a stay can't run over a day that has its own entry (400 on `date` or `checkOutDate`). `POST /clock` with `out` closes the latest open entry from the last 7 days, setting `checkOutDate` when it started on an earlier day; `in` is refused while one is open. Contracts carry `nightBonus` (default `true` on create): the summary adds `nightMinutes` and `nightBonusCents` (20% of the minute rate on minutes between 22:00 and 05:00) to what is earned.

## Payments + receipts

Every entry of the payments list is a `Payment` with a `kind` (`PAYMENT_KINDS`): `pay` (diárias/salário, default), `bonus` (gratificação), `transport` (vale-transporte), `advance` (adiantamento), `deduction` (desconto). The adjustments API (`/contracts/:id/adjustments`) is gone; migration `0003_payment_kinds` moved its rows here.

| Method | Path                                       | Who      | Body                                                                                   | Response                                                                                                                                                                                 |
| ------ | ------------------------------------------ | -------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/contracts/:id/payments?year=YYYY`        | both     | –                                                                                      | `{ payments: Payment[] }` newest first                                                                                                                                                   |
| GET    | `/contracts/:id/advances`                  | both     | –                                                                                      | `{ advances: Payment[] }` every `advance` of the contract, any year, newest first, with `settledCents`/`remainingCents`                                                                  |
| POST   | `/contracts/:id/payments`                  | employer | `multipart/form-data`: fields of `createPaymentSchema` + optional file field `receipt` | 201 `{ payment }`                                                                                                                                                                        |
| PUT    | `/contracts/:id/payments/:pid/receipt`     | employer | multipart file `receipt`                                                               | `{ payment }` (replaces)                                                                                                                                                                 |
| GET    | `/contracts/:id/payments/:pid/receipt`     | both     | –                                                                                      | file stream, `Content-Type` from stored mime, `Content-Disposition: inline; filename="comprovante-<month>.<ext>"`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` |
| DELETE | `/contracts/:id/payments/:pid`             | employer | –                                                                                      | 204 (also deletes file)                                                                                                                                                                  |
| POST   | `/contracts/:id/payments/:pid/acknowledge` | worker   | –                                                                                      | `{ payment }` "recebi"                                                                                                                                                                   |
| POST   | `/contracts/:id/payments/:pid/confirm`     | employer | –                                                                                      | `{ payment }` "concluído" without waiting for the worker (`payment:confirm`)                                                                                                             |
| PATCH  | `/contracts/:id/payments/:pid`             | employer | JSON `updatePaymentSchema` (any subset of the create fields, at least one)             | `{ payment }`                                                                                                                                                                            |

`Payment` carries `kind`, `method` (`null` when no money changed hands), `advanceId`, the derived `settledCents`/`remainingCents` (set only for `advance`, null otherwise), `acknowledgedAt`, `acknowledgedBy` and `acknowledgedByRole`. Acknowledge and confirm both set the three `acknowledged*` fields, are idempotent and keep the first confirmation; they are audited as `payment.acknowledge` and `payment.confirm`.

How each kind counts (`computeMonthSummary`, helpers `countsAsPaid`/`handsMoney` in `packages/shared/src/payment.ts`):

| kind        | due (`adjustmentsCents`) | paid (`paidCents`)                  | method   | receipt, recebi, concluir |
| ----------- | ------------------------ | ----------------------------------- | -------- | ------------------------- |
| `pay`       | –                        | + amount                            | required | yes                       |
| `bonus`     | + amount                 | + amount (when it has a method)     | required | yes                       |
| `transport` | + amount                 | + amount (when it has a method)     | required | yes                       |
| `advance`   | –                        | – (its abatements count, see below) | required | yes                       |
| `deduction` | − amount                 | –                                   | `null`   | no (409 `CONFLICT`)       |

A `bonus`/`transport` with `method: null` exists only from the migration (an old Extras adjustment: due only); the API never creates one, and an edit may keep it methodless as long as the kind stays.

Rules (`paymentRuleIssues`, shared by create and the merged PATCH; 400 `fieldErrors`): a `deduction` has no method and no `agreementId`/`advanceId`; every other kind needs a method; `compensation` is only for `pay`; an `agreementId` or an `advanceId` needs method `compensation`, not both; compensation with neither needs a note. A desconto with a receipt file is rejected (`fieldErrors.receipt`) and nothing is stored.

Adiantamentos: an abatement is a `pay` payment with method `compensation` and `advanceId` pointing at an `advance` of the same contract (else `fieldErrors.advanceId` "Adiantamento não encontrado"). Its amount cannot exceed the advance's `remainingCents` (`fieldErrors.amountCents`, checked again inside the insert transaction). `remainingCents = max(0, amountCents − sum of linked abatements)`. `DELETE` of an advance with abatements answers 409 with the abated amount; a PATCH cannot change its kind or lower its amount below what was abated (400). Deleting an abatement restores the remaining balance. Audit `payment.create` carries `meta.kind` and, for abatements, `meta.advanceId`; `payment.delete` carries `meta.kind`.

PATCH merges the input onto the stored payment. A linked agreement or advance must still have room for the amount increase. Changing `kind`, `referenceMonth`, `paidOn`, `amountCents`, `method`, `agreementId` or `advanceId` clears the `acknowledged*` fields (and turning an entry into a desconto always does); `note` does not. Turning an entry into a desconto drops its method; one with a receipt cannot become a desconto. Audited as `payment.update` with `meta.changed` and `meta.reopened`.

`latest` (the dashboard's `lastPayment`) skips entries without a method.

Receipt rules: max `RECEIPT_MAX_BYTES` (5 MB), type detected from magic bytes (not the client mime) and must be in `RECEIPT_MIME_TYPES`; stored outside any static dir under a random filename; original filename sanitised and kept only for display.

## Summary, statement, activity, dashboard

| Method | Path                                  | Response                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/contracts/:id/summary?month=`       | `{ summary: MonthSummary }` computed with `computeMonthSummary` (payments filtered by `referenceMonth`)                                                                                                                                                                                                                                                        |
| GET    | `/contracts/:id/statement.csv?month=` | `text/csv; charset=utf-8` with BOM, `;` separator (Excel pt-BR), one row per day + totals (the adjustments line reads "Gratificações, vale-transporte e descontos", plus "Adiantamentos ainda a abater") and the month's payments with a Tipo column; abatements name their adiantamento. Cells starting with `= + - @` are prefixed with `'` (CSV injection). |
| GET    | `/contracts/:id/activity?limit=50`    | `{ activity: ActivityItem[] }` newest first                                                                                                                                                                                                                                                                                                                    |
| GET    | `/dashboard`                          | `{ items: DashboardItem[], month: YearMonth, today: IsoDate }` current month for every active contract the caller can see                                                                                                                                                                                                                                      |

## Health

`GET /api/health` → `{ status: "ok", db: "ok", version }` (no auth).

## Team management (v2)

Additions to `Contract`: `contactEmail`, `contactPhone` (typed by the employer before the worker has an account; optional, validated by `createContractSchema`/`updateContractSchema`; PATCH leaves them alone when omitted) and `archivedAt` (logical removal).

| Method | Path                                   | Who      | Body                   | Response                                                                                                                                                                                                   |
| ------ | -------------------------------------- | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/contracts`                           | employer | `createContractSchema` | 201 `{ contract, invite: InviteDelivery \| null }`. When `contactEmail` or `contactPhone` is given and no worker is linked, an invite is created right away; with an e-mail it is sent through the mailer. |
| POST   | `/contracts/:id/invite`                | employer | –                      | `{ invite: InviteDelivery }` (was `{ code, expiresAt }`). Regenerates and, when the contract has `contactEmail`, e-mails it again.                                                                         |
| DELETE | `/contracts/:id`                       | employer | –                      | 204. Logical removal: sets `archivedAt`, drops the pending invite. Nothing is deleted.                                                                                                                     |
| POST   | `/contracts/:id/restore`               | employer | –                      | `{ contract }` with `archivedAt = null`.                                                                                                                                                                   |
| GET    | `/contracts?include=archived`          | both     | –                      | Archived contracts are excluded unless `include=archived`.                                                                                                                                                 |
| GET    | `/team?month=YYYY-MM&include=archived` | both     | –                      | `{ items: DashboardItem[], month, today }` for every contract the caller can see (active and ended; archived only when asked), each with that month's summary. Powers the team table.                      |

`InviteDelivery` = `{ code, expiresAt, signupUrl, emailSent, whatsappUrl }`. `signupUrl` is `WEB_ORIGIN/criar-conta?convite=CODE`. `whatsappUrl` is `https://wa.me/55<digits>?text=<message with signupUrl>` when a phone is known (contact or linked profile), else null: WhatsApp has no free sending API, so the employer taps the link to send it. E-mail goes through SMTP when `SMTP_URL` is set; in development it lands in `/api/v1/dev/outbox`.

Archived contracts are read-only: writes to entries, clock and payments return 409 `CONFLICT` ("Este vínculo foi removido"). The worker keeps read access to history and sees the contract as removed. `/dashboard` never includes archived contracts.

Shared estimate helpers (`packages/shared/src/estimate.ts`): `estimateMonthCost` (rate × expected days, × hours per day for hourly, fixed for monthly, 2 × rate for biweekly), `estimateAverageMonthlyCost` (12-month average) and `derivedRates` (the rate per month, quinzena, expected day and hour; null where times or fixed days are missing). Both return `null` when the schedule can't be priced (on demand, or hourly without expected times).

## Agreements, compensation, account deletion, projections (v3)

Agreements (`Agreement` in `@emdia/shared`) record something the worker pays back in work (a dining table, an advance). Each installment is a `Payment` with `method: "compensation"` and `agreementId`. Compensation payments count toward `paidCents` like any payment and go through the same "recebi" acknowledgement. A compensation payment without an agreement is allowed for one-off settlements and needs a `note`.

| Method | Path                                     | Who      | Body                                             | Response                                                                                                                                                 |
| ------ | ---------------------------------------- | -------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/contracts/:id/agreements`              | both     | `?include=archived`                              | `{ agreements: Agreement[] }` newest first, with derived `settledCents`/`remainingCents`; removed ones only with `include=archived`                      |
| POST   | `/contracts/:id/agreements`              | employer | `createAgreementSchema`                          | 201 `{ agreement }`                                                                                                                                      |
| POST   | `/contracts/:id/agreements/:aid/accept`  | worker   | –                                                | `{ agreement }` sets `acceptedAt`                                                                                                                        |
| POST   | `/contracts/:id/agreements/:aid/cancel`  | employer | –                                                | `{ agreement }` sets `cancelledAt`; linked payments stay. Kept for older clients; the web removes instead                                                |
| DELETE | `/contracts/:id/agreements/:aid`         | employer | –                                                | 204, sets `archivedAt` (idempotent). Its compensation payments are hidden everywhere until restored                                                      |
| POST   | `/contracts/:id/agreements/:aid/restore` | employer | –                                                | `{ agreement }` clears `archivedAt`; its payments count again                                                                                            |
| POST   | `/contracts/:id/payments`                | employer | `createPaymentSchema` (+ optional `agreementId`) | An `agreementId` must belong to the contract, not be cancelled or removed, and the amount can't exceed `remainingCents` (400 `fieldErrors.amountCents`). |

A removed agreement (`archivedAt` set) answers 404 to accept and cancel, and its compensation payments are left out of `GET /payments`, the month summary (`paidCents`, `payments`), the latest payment and the statement; acting on one of those payments answers 404. Nothing is deleted. Archived contracts reject agreement writes with 409 like other writes. Audit actions: `agreement.create`, `agreement.accept`, `agreement.cancel`, `agreement.archive`, `agreement.restore`.

`DELETE /me` with `deleteAccountSchema` (`{ password, confirm: "EXCLUIR" }`): wrong password → 400 `fieldErrors.password`. The account is anonymised, not erased: name becomes "Conta excluída", e-mail is replaced so it can be reused, password hash and phone/Pix are wiped, every session is revoked, the refresh cookie is cleared. An employer's contracts are archived (history stays for the worker). A worker is unlinked from their contracts (`workerId = null`, `workerName` kept) so the employer keeps the records. Audit `auth.delete_account`. 204.

Projections: `DashboardItem.estimate` (a `MonthEstimate` from `estimateMonthCost`) is returned by `/dashboard` and `/team` for any month, including future ones (`/dashboard?month=YYYY-MM` now accepts a month too, default current). For future months the summary has no entries, so clients show the estimate as "previsto".
