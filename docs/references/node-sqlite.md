# node:sqlite notes

Built into Node >= 22.18 (`import { DatabaseSync } from "node:sqlite"`). Synchronous API.

- Open: `new DatabaseSync(path)`. Run `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON` and `PRAGMA busy_timeout = 5000` right after opening.
- Statements: `db.prepare(sql)` returns a `StatementSync` with `.run(...params)`, `.get(...)`, `.all(...)`. Always bind parameters; never concatenate input into SQL.
- Rows come back as objects with null prototype; copy or map them in repos before returning.
- Integers beyond 2^53 need `setReadBigInts(true)`. Cents fit in a normal number, so keep the default.
- No transaction helper is built in: wrap `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` in one function in `src/db` and use it from services.
- Run schema changes as numbered migrations inside a transaction; keep SQL in strings so `bun run docs:schema` can parse it.
- Backups: `VACUUM INTO 'file'` ([RELIABILITY](../RELIABILITY.md#data-and-backups)).
- The module may print an experimental warning on older Node versions; that is expected.
