# Frontend

Visual rules are in [DESIGN](DESIGN.md). This file covers conventions and behavior. Layering is in [ARCHITECTURE](ARCHITECTURE.md#web-layering).

## Conventions

- Vue 3.5 single-file components with `<script setup lang="ts">`.
- Types and schemas come from `@emdia/shared`. Reuse the zod schemas for client-side form validation.
- Server data lives in the Pinia Colada query cache (see [Data fetching](#data-fetching)); session state lives in Pinia stores; components hold only view state. Do not call `fetch` outside `src/api`.
- Styling: components keep scoped CSS for their own internals, using tokens from `src/styles/tokens.css`. Pages compose layout with Tailwind utilities (see below). No raw hex values anywhere.
- Copy is pt-BR, informal, "você". Titles and headings in sentence case ("Cartão de outubro"); `.page-title`, `.section-title`, `PageHeader`, `Sheet` and `AuthHeader` capitalize the first letter of data-built titles for you. All user-visible strings in components or a single `copy` module, never built from API error codes alone; show the API's pt-BR `message`.
- Format with `formatCents`, `formatDuration`, `formatYearMonth`. Numbers render in the mono face.
- No `v-html`. No tokens in `localStorage` or `sessionStorage`. `localStorage` is allowed for per-viewer conveniences only: the theme, the install-hint flag and the collapsed sidebar (`composables/sidebar.ts`). Wrap every access in try/catch; private mode must still work.

## Tailwind (layout layer)

Tailwind v4 runs through `@tailwindcss/vite`; `src/styles/tailwind.css` imports only the theme and utilities layers (no preflight: `base.css` owns the reset) and maps the tokens with `@theme inline`:

- colors: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-rule`, `text-ink`, `text-ink-2`, `text-ink-3`, `brand`, `brand-strong`, `brand-wash`, `brand-ink`, `coral`, `coral-wash`, `coral-ink`, `amber`, `amber-wash`, `amber-ink`, `sidebar*`, `on-ink`. The default palette is switched off, so `bg-red-500` doesn't exist.
- radius `rounded-1/2/3`, shadows `shadow-rest` / `shadow-lift`, fonts `font-sans` / `font-num`, easings `ease-enter` / `ease-leave`.
- breakpoints `md:` 640, `lg:` 960, `xl:` 1280, `2xl:` 1600 (no `sm:`: unprefixed is the phone).
- Tokens switch light/dark themselves; don't use `dark:`.

Use it for page layout: `grid grid-cols-12 gap-6`, `col-span-12 lg:col-span-8`, `flex`, `gap-*`, `p-*`. Utilities live in a cascade layer, so a component's scoped CSS wins over a utility on the same property: put layout utilities on wrappers, not to restyle a component's internals.

Helper classes in `base.css`: `.kpi-grid` (KPI cards: a row when they fit, stacking down to one column), `.page-grid` + `.span-*`, `.form-column`, `.tone-brand|amber|coral|neutral`, `.lift` (hover lift for clickable cards).

## Motion

- Pages fade in and rise 8px (`route-*` transition in `App.vue`, keyed by the top-level route so tabs don't remount the page); tabs cross-fade with `<Transition name="tab-fade" mode="out-in">`.
- Active nav and tab indicators slide: `useSlidingIndicator(container, ".is-active", "x" | "y", () => activeKey)` from `lib/motion.ts` returns a style for one absolutely positioned indicator element.
- `DataTable` rows fade in with a 20ms stagger (capped at 8) and fade out on removal. KPI values count up when you pass `amount` + `format` to `KpiCard` (`useCountUp`).
- Loading states mirror the loaded layout. Use the pieces in `components/ui`: `Skeleton` (bar or `round`), `SkeletonKpi`, `SkeletonTable` (real header on md+, cards below; `DataTable` uses it with its visible columns), `SkeletonTimeCard`, `SkeletonBoard` (board grid or week cards), `SkeletonLedger`, `SkeletonMonth`, `SkeletonForm`. `KpiCard`'s `loading` keeps the label and swaps value and caption. `ContractTabSkeleton` draws the active tab's layout while the contract loads. Show them only while there is no data yet.
- Durations `--d-fast` 120ms, `--d-base` 180ms, `--d-sheet` 220ms; `--ease-out` to enter, `--ease-in` to leave. `prefers-reduced-motion` keeps only opacity.

## Controls

- `Select` (custom listbox on fine pointers, the native picker on touch; a real `<select>` always stays in the DOM). `ChoiceField` = segmented on `md`+, Select below. `TimeField` (masked `HH:MM`, 15-min slots on desktop, hour/minute sheet on touch). `DateField` (masked `DD/MM/AAAA`, ISO in the model, calendar popover / sheet; a pasted ISO date is accepted). Never `<input type="time|date|month">`.
- Floating things (`Tooltip`, `Menu`, `Select`, `Popover`) teleport to the layer returned by `layerFor(anchor)` in `lib/layer.ts`: the open modal `<dialog>` that contains the anchor, otherwise `<body>`. A modal dialog makes the rest of the page inert, so a layer mounted on `<body>` would be unreachable from inside it. They are placed with `lib/position.ts` and never clip or widen a table. New floating UI must use `layerFor`, not a bare `<Teleport to="body">`.
- Icons come from `ACTION_ICON` in `components/ui/icons.ts` (one icon per action, see [DESIGN](DESIGN.md#icons)). Long page-header actions use `<Button icon icon-only label>`; the hover delay and warm-up live in `Tooltip` (`components/ui/tooltip.ts`), so any trigger gets the same behavior. `Tooltip` also takes `side="right"` and `disabled`.
- Row actions go through `TableActions` (`actions` inline, at most 2, colored by meaning; the rest in the `⋯` menu; a single action renders as one inline button).
- Filters: put them in `DataTable`'s `filters` slot; below `md` they move into a bottom drawer behind "Filtros (n)" (`filterCount` prop).

## Navigation

"Voltar" uses `useBack(fallback)` (`composables/back.ts`): it returns to the previous screen when it was inside the app (`history.state.back`), otherwise to `fallback`. `PageHeader`'s `back` prop is that fallback. After saving a form, return to the origin: `if (previousInApp()) router.back(); else router.replace(fallback)`.

## Tables

- Every collection renders through `components/ui/DataTable.vue`: a table on `md`+ and cards on `sm`, from one column definition (`lib/table.ts`). Views never write a raw `<table>`; the harness fails on it. Feature components with a genuinely tabular shape (time card, month board) live in `components/feature` and may use `<table>` or grids.
- `composables/tableState.ts` (`useTableState`) mirrors search, filters, tab and sort in the route query. Pass it to `DataTable` as `state`; without it the table keeps local state.
- Sorting, search and filtering run client-side on the rows already loaded. Columns declare how to read a sortable value and how to render the cell.
- Row actions must stay reachable without horizontal scroll. `DataTable` watches its width (`ResizeObserver`) and, when the table overflows, tightens padding and then hides columns in `dropOrder` (`priority` ascending, `hideBelow` columns count as 0, ties right to left). Give every table's secondary columns a `priority` or `hideBelow`. Totals rows take colspans from the `columns` the `footer` slot receives (`spansAround` in `lib/table.ts`), never from breakpoints.
- `truncate: true` on a free-text column cuts it at `width` (default 16rem) and shows the full text in a `Tooltip`.
- Money, hours and dates are right-aligned in the mono face; status is a `StatusChip`.

## Breakpoints

`sm` < 640, `md` 640 to 959, `lg` 960+ (sidebar), `xl` 1280+, `2xl` 1600+. Use the helpers in `lib/media.ts`, not ad hoc `matchMedia`. Content is fluid up to 1440px; forms use a readable column.

## Layer rule for ui

`components/ui` components (`DataTable`, `Sheet`, `Menu`, `KpiCard`, ...) receive everything by props and slots. They import no stores, no api client and no pinia, so they stay reusable and testable. Data loading belongs in views or feature components.

## Non-null assertions on the session

Never write `auth.user!` or `x.user!.`. The user is null before the session loads and after logout, and the assertion crashed a view. Use the optional chain or a guard (`if (!auth.user) return`) or the typed helpers on the auth store. The harness fails on it.

## State

- The access token lives in the auth store (memory). On load, call `/auth/refresh` to restore the session.
- The api client attaches `Authorization`, retries once after a refresh on `TOKEN_EXPIRED`, and sends `X-Requested-With: emdia` on `/auth/*` cookie endpoints.
- Route guards read the auth store and the user role; role-specific routes redirect rather than render an error.

## Data fetching

Reads go through `useResource(source, key, fetcher)` in `composables/resource.ts`, a thin layer over `useQuery` from `@pinia/colada`. The cache is a Pinia store (`useQueryCache()`, id `_pc_query`, visible in the Pinia devtools); its options (`queryCacheOptions()`) live in `api/query.ts` and `main.ts` installs it with `app.use(PiniaColada, ...)` after Pinia.

- `key(source)` builds the cache key with a factory from `api/keys.ts` (`queryKeys.entries({ id, month })`, `queryKeys.team(month)`, ...). Never write a key by hand: the factories keep everything about one contract under `["contract", id]` so one prefix reaches it. A `null` key means there is nothing to fetch yet.
- `fetcher(source)` receives the value its key was built from, so a slow answer or a retry for the month you just left lands in that month's entry, never on screen.
- `loading` is true only while there is nothing cached; a cached value renders at once and refreshes behind it (`fetching`). `error` is always an `ApiError`. `reload()` refetches; `mutate(next)` writes the cache with a server response.
- Defaults: data is fresh for 30s, refetched on window focus and on reconnect, and a failed read retries twice (1s, then 2s later, through `@pinia/colada-plugin-retry`) unless it is a 4xx. While a retry waits, the entry keeps its previous state, so the error shows only after the last attempt. Colada has no offline pause, so a failed read always shows its error.
- After a write, call `useInvalidate()`: `records(contractId, ...fresh)` for entries, adjustments, payments and agreements, `contract(contractId, ...fresh)` when the contract itself changed, `all()` when the reach is unknown (actions inside feature components, profile edits, new or joined contracts). Matching reads on screen refetch now, the rest when they open. Pass the resources you already updated with `mutate` as `fresh` to skip their refetch. The returned promise waits for the refetches and never rejects; a failed refetch shows as that read's error.
- Two screens that need a different shape of the same endpoint share one key and derive the shape with a `computed` (`NewPaymentView` filters the contract list), so the cache never holds two versions of one response.
- Logout (`auth.clear()`) empties the cache with `clearQueryCache`, so the next account never sees the previous one's data. Reads still on screen go back to `loading`; the rest are removed.
- Tests install the cache with `[PiniaColada, queryCacheOptions({ retry: false })]` next to the Pinia instance, and seed it with `useQueryCache().setQueryData(key, data)` before mounting. A `watch` on `resource.data` that fills a form needs `immediate: true`, because cached data is already there at setup.

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
