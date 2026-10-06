# Frontend

Visual rules are in [DESIGN](DESIGN.md). This file covers conventions and behavior. Layering is in [ARCHITECTURE](ARCHITECTURE.md#web-layering).

## Conventions

- Vue 3.6 single-file components with `<script setup lang="ts">`.
- Types and schemas come from `@emdia/shared`. Reuse the zod schemas for client-side form validation.
- Server state lives in Pinia stores; components hold only view state. Do not call `fetch` outside `src/api`.
- Styling: scoped CSS using tokens from `src/styles/tokens.css`. No raw hex values, no CSS frameworks.
- Copy is pt-BR, informal, "você". Lowercase headings in the app chrome. All user-visible strings in components or a single `copy` module, never built from API error codes alone; show the API's pt-BR `message`.
- Format with `formatCents`, `formatDuration`, `formatYearMonth`. Numbers render in the mono face.
- No `v-html`. No tokens in `localStorage` or `sessionStorage`. `localStorage` is allowed for the theme only.

## Tables

- Every collection renders through `components/ui/DataTable.vue`: a table on `md`+ and cards on `sm`, from one column definition (`lib/table.ts`). Views never write a raw `<table>`; the harness fails on it. Feature components with a genuinely tabular shape (time card, month board) live in `components/feature` and may use `<table>` or grids.
- `composables/tableState.ts` (`useTableState`) mirrors search, filters, tab and sort in the route query. Pass it to `DataTable` as `state`; without it the table keeps local state.
- Sorting, search and filtering run client-side on the rows already loaded. Columns declare how to read a sortable value and how to render the cell.
- Money, hours and dates are right-aligned in the mono face; status is a `StatusChip`.

## Breakpoints

`sm` < 640, `md` 640 to 959, `lg` 960+ (sidebar), `xl` 1280+, `2xl` 1600+. Use the helpers in `lib/media.ts`, not ad hoc `matchMedia`. Content is fluid up to 1440px; forms use a readable column.

## Layer rule for ui

`components/ui` components (`DataTable`, `Sheet`, `Menu`, `KpiCard`, ...) receive everything by props and slots. They import no stores, no api client and no pinia, so they stay reusable and testable. Data loading belongs in views or feature components.

## State

- The access token lives in the auth store (memory). On load, call `/auth/refresh` to restore the session.
- The api client attaches `Authorization`, retries once after a refresh on `TOKEN_EXPIRED`, and sends `X-Requested-With: emdia` on `/auth/*` cookie endpoints.
- Route guards read the auth store and the user role; role-specific routes redirect rather than render an error.

## PWA behavior

- `vite-plugin-pwa` with a prompt-for-update flow: when a new service worker is waiting, show a "nova versão disponível" bar with an "atualizar" button.
- Precache the app shell and self-hosted fonts. Never cache `/api/` responses in the service worker except the explicit offline reads below.
- Install: capture `beforeinstallprompt`, show the install button in `/perfil`.

## Offline

- Reads: the last loaded dashboard and current-month time card are kept in memory and shown with an "offline" notice when the network fails.
- Writes: not queued in the MVP. A failed write shows a clear retry message. The clock button is disabled offline because the server time is authoritative.

## Accessibility

- WCAG AA contrast in both themes, visible focus ring, touch targets at least 44px, `lang="pt-BR"`.
- Bottom sheets use `<dialog>` with focus trap and Esc to close.
- Stamps and status dots have `aria-label` with the full status text; color is never the only signal.
- Respect `prefers-reduced-motion`.
