# e2e

Browser tools that drive the running app with the system Chrome (`playwright-core`).

- `screens`: screenshots of every screen (mobile and desktop, light and dark) plus a report of console errors and failed requests. Output goes to `screens/` or `--out dir`.
- `flows`: user journeys (signup, invite, clock in/out, confirmation, absence, extras, payment with receipt, CSV, auth checks, password reset). Prints PASS/FAIL per journey and exits non-zero on any failure, console error, page error or 5xx. Failure screenshots go to `out/`.

## Prerequisites

- `bun run dev` running (web on :5173 proxying the API on :3000).
- `screens` needs seed data: `bun run seed -- --reset`.
- `flows` signs up fresh users with unique e-mails and needs no seed. It reads the dev mail outbox (`/api/v1/dev/outbox`), so the API must not run in production mode.
- Google Chrome installed.

## Running

```sh
cd tools/e2e
node scripts/screens.ts
node scripts/flows.ts
```

Use node, not bun: Playwright crashes under bun. Node 24 strips the TypeScript types, so no build step is needed. The `bun run screens` and `bun run flows` package scripts also work, since they just call node.
