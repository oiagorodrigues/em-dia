# Frontend

Visual rules are in [DESIGN](DESIGN.md). This file covers conventions and behavior. Layering is in [ARCHITECTURE](ARCHITECTURE.md#web-layering).

## Conventions

- Vue 3.6 single-file components with `<script setup lang="ts">`.
- Types and schemas come from `@ponto/shared`. Reuse the zod schemas for client-side form validation.
- Server state lives in Pinia stores; components hold only view state. Do not call `fetch` outside `src/api`.
- Styling: scoped CSS using tokens from `src/styles/tokens.css`. No raw hex values, no CSS frameworks.
- Copy is pt-BR, informal, "você". Lowercase headings in the app chrome. All user-visible strings in components or a single `copy` module, never built from API error codes alone; show the API's pt-BR `message`.
- Format with `formatCents`, `formatDuration`, `formatYearMonth`. Numbers render in the mono face.
- No `v-html`. No tokens in `localStorage` or `sessionStorage`. `localStorage` is allowed for the theme only.

## State

- The access token lives in the auth store (memory). On load, call `/auth/refresh` to restore the session.
- The api client attaches `Authorization`, retries once after a refresh on `TOKEN_EXPIRED`, and sends `X-Requested-With: ponto` on `/auth/*` cookie endpoints.
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
