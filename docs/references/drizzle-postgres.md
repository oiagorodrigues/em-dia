# Drizzle and Postgres notes

The API talks to PostgreSQL through Drizzle ORM (`drizzle-orm` 0.45, `drizzle-kit` 0.31, `drizzle-zod` 0.8).

- Schema: `apps/api/src/db/schema.ts` is the source of truth. Enum-like text columns take their values and their `CHECK` constraints from the same constant arrays as the zod schemas in `@emdia/shared`.
- Types: ids are `text`, money is `integer` cents, ISO dates are `date` (mode `string`), timestamps are `timestamptz` (mode `date`; repos turn them into ISO strings), schedule arrays and audit meta are `jsonb`.
- Migrations: change `schema.ts`, run `bun run db:generate`, commit `apps/api/drizzle/`. Never edit a generated SQL file that has shipped. `apps/api/tests/migrations-sync.test.ts` fails when the schema and the SQL drift; `bun run --cwd apps/api db:check` checks the migration history itself.
- Drivers, picked from `DATABASE_URL` in `src/db/index.ts`:
  - unset, `pglite:<dir>` or `pglite:memory`: PGlite, Postgres compiled to WASM, in process. Dev data lives in `apps/api/data/pglite`. One process per data dir (a pid file enforces it): stop the API before `bun run seed`.
  - `postgres://` / `postgresql://`: node-postgres `Pool`. Neon in production (pooled URL), `docker compose` and any self-hosted Postgres.
- Transactions: `repos.tx(async (r) => …)` runs on one connection; use only `r` inside. Postgres enforces foreign keys, so `ON DELETE` rules in the schema do run.
- Queries: use the query builder. With a single table, Drizzle renders column names unqualified, so a correlated subquery written with `sql` can bind `"id"` to the wrong table. Use a join (columns are then qualified) or an aggregated subquery with `.as()`.
- `drizzle-zod` checks `jsonb` columns on read (`createSelectSchema` with refinements), since their TypeScript type is declared, not enforced by Postgres.
- Tests run on in-memory PGlite. Set `EMDIA_TEST_POSTGRES_URL` to also run `tests/db-drivers.test.ts` against a real Postgres.
