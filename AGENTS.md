# AGENTS.md

"em dia" is a PWA for Brazilian households to track hours, attendance, payments and receipts of domestic workers.
Employers and workers see the same time card and confirm each other's entries.
The repo is the system of record: if a decision is not in here, it does not exist. This file is a map; details live in `docs/`.

## Repo map

| Path              | What                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `packages/shared` | `@emdia/shared`: domain types, zod schemas, RBAC, pay math, time helpers   |
| `apps/api`        | Express 5 API (`/api/v1`), Postgres via Drizzle (PGlite locally)           |
| `apps/web`        | Vue 3.6 + Pinia + vue-router PWA (vite-plugin-pwa)                         |
| `tools/e2e`       | Browser journeys and screenshots (`node scripts/flows.ts`, see its README) |
| `tools/harness`   | `@emdia/harness`: architecture, taste and doc tests, schema generator      |
| `tools/e2e`       | `@emdia/e2e`: drives the running app in Chrome (screenshots, journeys)     |
| `docs/`           | Knowledge base (see below)                                                 |

## Commands

Toolchain is Vite+ (`vp`). No ESLint, no Prettier.

- `bun install` then `bun run dev` (api + web), `bun run seed` (demo data)
- `vp check` format + lint + types; `vp check --fix` to auto-fix
- `vp run -r test` all tests, including the harness; `vp run -r build`
- `bun run ready` check + test + build (run before declaring done)
- `bun run docs:schema` regenerate `docs/generated/db-schema.md`
- Web `.vue` type check: `bun run --cwd apps/web typecheck` (vue-tsc; the whole repo uses TypeScript 6.0.3 because vue-tsc does not run on TS 7 yet)
- See the UI yourself: with `bun run dev` up, `node tools/e2e/scripts/screens.ts` (needs `bun run seed -- --reset`) and `node tools/e2e/scripts/flows.ts`. Read the PNGs and `report.txt`. See [e2e README](tools/e2e/README.md)
- Production locally: `bun run build && bun run start` (API serves `apps/web/dist`); container: `Dockerfile`
- Deploy on Vercel (Neon + private Blob, `vercel.json`, `bun run build:vercel`): [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md). Schema change: edit `apps/api/src/db/schema.ts`, `bun run db:generate`, commit `apps/api/drizzle/`

## Golden principles

Each is enforced by `tools/harness` where it can be. A failure message says WHAT, FIX and REF.

- Contract first: shapes and validation live in `@emdia/shared` and `docs/product-specs/api-contract.md`. Never redefine a type locally.
- Money is integer cents (`*Cents`). Format only at the edge with `formatCents`.
- "Today" is computed in the household timezone with `nowInZone`, never `new Date()` date parts.
- API layering: `http -> services -> repos -> db`; `config`/`lib` usable everywhere; only `server.ts` imports `http`; no express outside `http`.
- Web layering: `api -> stores -> composables -> components/{ui,feature} -> views`; `ui` never imports stores or api.
- Apps never import each other; `packages/shared` imports no node, express or vue.
- Security: unseen resources return 404, not 403; access token in memory only, never web storage; receipts validated by magic bytes; no secrets in logs.
- UI copy is pt-BR, informal, "você". `docs/DESIGN.md` is law for UI: tokens only, no raw hex.
- No `v-html`, no `console.log` in api (use the logger), no eslint/prettier.

## Where to find what

| Question                         | Doc                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| How is it structured?            | [ARCHITECTURE](docs/ARCHITECTURE.md)                                                                |
| What does the API accept/return? | [api-contract](docs/product-specs/api-contract.md)                                                  |
| What must each feature do?       | [features](docs/product-specs/features.md), [index](docs/product-specs/index.md)                    |
| How should the UI look?          | [DESIGN](docs/DESIGN.md), [FRONTEND](docs/FRONTEND.md)                                              |
| Security rules and threat model  | [SECURITY](docs/SECURITY.md)                                                                        |
| Ops, backups, health, logs       | [RELIABILITY](docs/RELIABILITY.md)                                                                  |
| Who are the users, why           | [PRODUCT_SENSE](docs/PRODUCT_SENSE.md)                                                              |
| What are we building now         | [PLANS](docs/PLANS.md), [active plan](docs/exec-plans/active/0002-next.md)                          |
| Known gaps and grades            | [QUALITY_SCORE](docs/QUALITY_SCORE.md), [tech debt](docs/exec-plans/tech-debt-tracker.md)           |
| Operating principles             | [core-beliefs](docs/design-docs/core-beliefs.md)                                                    |
| Tool notes (vp, Drizzle, Vue)    | [references](docs/references/vite-plus.md), [Drizzle/Postgres](docs/references/drizzle-postgres.md) |
| DB schema (generated)            | [generated](docs/generated/README.md)                                                               |

## How to work

1. Read the active exec plan and the docs for the area you touch.
2. If the change needs a new decision, add a line to the plan's decision log first.
3. Change the code. Contract changes start in `packages/shared`, then api, then web.
4. Run `vp check` and `vp run -r test`; for UI changes also run the e2e scripts and look at the screenshots. Fix harness failures by following the FIX text, not by editing the rule.
5. Update the docs you made stale, tick the plan checkbox, and update `docs/QUALITY_SCORE.md`.

## Definition of done

- `bun run ready` passes.
- New behavior has a test (api: supertest; shared: unit; web: component or store test).
- Docs, plan checkboxes and quality score reflect the change.
- Acceptance criteria in `docs/product-specs/features.md` hold for both roles.
