# Security

## Threat model

Assets: login credentials, Pix keys and phone numbers, hours and pay records, receipt files.

| Threat                           | Who                      | Main mitigation                                                 |
| -------------------------------- | ------------------------ | --------------------------------------------------------------- |
| Reading another household's data | Any logged-in user       | Ownership checks in services, 404 for invisible resources       |
| Worker acting as employer        | Worker                   | RBAC from `@emdia/shared`, checked in services                  |
| Credential stuffing, brute force | Internet                 | Rate limits, 5-failure lockout, scrypt, generic login errors    |
| Token theft via XSS              | Injected script          | No `v-html`, CSP via helmet, access token in memory only        |
| CSRF on cookie endpoints         | Malicious site           | `SameSite=Strict`, `X-Requested-With: emdia`, CORS allowlist    |
| Stolen refresh token             | Network or device theft  | Rotation with reuse detection, logout-all, token version        |
| Malicious upload                 | Employer account         | Size cap, magic-byte type check, random name, no static serving |
| CSV formula injection            | Worker or employer notes | Prefix cells starting with `= + - @`                            |
| Account enumeration              | Internet                 | Forgot-password always 204, generic login error                 |
| Disputed history                 | Either party             | Audit log, dual confirmation                                    |

Out of scope for the MVP: payment processing, multi-region, native apps.

## Controls

Status values: `todo`, `implemented`, `verified` (a test or manual check proves it). Verified controls are covered by `apps/api/tests` or the harness; `implemented` ones are in code but not exhaustively tested (every mutation writing an audit row; uploads stored outside static dirs). Update this column when you verify.

| Control                                                                               | Status      | Where / test                         |
| ------------------------------------------------------------------------------------- | ----------- | ------------------------------------ |
| helmet with CSP and `X-Content-Type-Options`                                          | verified    | `http` middleware                    |
| CORS allowlist from env, credentials only for allowed origins                         | verified    | `http` middleware                    |
| Rate limit on all routes, stricter on `/auth/*`                                       | verified    | `http` middleware                    |
| Account lockout: 5 failures, 15 min, 423 `ACCOUNT_LOCKED`                             | verified    | auth service                         |
| Passwords hashed with scrypt, per-user salt, timing-safe compare                      | verified    | `lib/password`                       |
| JWT verified with fixed algorithm HS256, `exp`, and `tv` match                        | verified    | auth middleware                      |
| Refresh rotation and family revoke on reuse                                           | verified    | auth service                         |
| Refresh cookie flags (`HttpOnly`, `SameSite=Strict`, path, `Secure`)                  | verified    | auth routes                          |
| CSRF header required on refresh and logout                                            | verified    | auth routes                          |
| Every request body, query and param parsed with zod                                   | verified    | route files (harness checks imports) |
| 404 instead of 403 for invisible resources                                            | verified    | services                             |
| Upload: 5 MB cap, magic-byte detection, allowed mime list                             | verified    | payments service                     |
| Upload stored outside static dirs under a random name                                 | implemented | payments service                     |
| Receipt download headers (`nosniff`, `private, no-store`)                             | verified    | payments routes                      |
| CSV cells starting with `= + - @` prefixed with `'`                                   | verified    | `lib/csv`                            |
| Audit log row for every mutation                                                      | implemented | services                             |
| No secrets, tokens or passwords in logs                                               | verified    | `lib/logger` redaction               |
| Password reset token hashed, 30 min, single use, revokes sessions                     | verified    | auth service                         |
| No tokens in web storage                                                              | verified    | harness `taste.test.ts`              |
| SMTP credentials only in `SMTP_URL` env, never in code, logs or responses             | implemented | `config`, `lib/mailer.ts`            |
| Invite codes and reset links logged or exposed in the outbox only outside production  | implemented | `lib/mailer.ts`                      |
| Archived contracts reject writes (409)                                                | verified    | services, `apps/api/tests`           |
| Account deletion requires password and confirmation, anonymises PII, revokes sessions | verified    | `apps/api/tests`, e2e journey 23     |
| No `v-html`                                                                           | verified    | harness `taste.test.ts`              |
| Production refuses to start with default JWT secret                                   | verified    | `config`                             |

## Account deletion and LGPD

`DELETE /me` anonymises the account; it does not erase rows.

- Wiped: password hash, phone, Pix key, every session and refresh token. The name becomes "Conta excluída" and the e-mail is replaced, so the address can register again and is no longer personal data in our store.
- Kept: contracts, work entries, adjustments, agreements, payments, receipts and the audit log, attached to the anonymised user. For a deleted worker, the contract keeps the worker's display name so the employer's records stay readable.
- Why: the other party has a legitimate interest in their own pay and hour records (proof of payment, labor disputes), and the data subject's request covers their personal data, not the counterparty's records. This is a design position, not legal advice; review it with counsel before wide release.
- Re-authentication: the request must carry the account password and the word `EXCLUIR`. A stolen access token alone cannot delete the account.
- The deletion is audited (`auth.delete_account`).

## Reporting

Security issues in this repo go to the maintainer privately, not in an issue.
