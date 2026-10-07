# Vue 3.5 notes

- Use `<script setup lang="ts">`, `defineProps`, `defineEmits`, `defineModel` for two-way props.
- Reactivity: `ref` and `computed` for local state; Pinia setup stores for shared state.
- Vue is pinned to 3.5.41 because `@pinia/colada` peers on `^3.5.41`. Vapor mode (3.6) is not available; do not move to 3.6 without a decision-log entry and a Colada release that supports it.
- Router: `vue-router` with route guards reading the auth store. Role-specific routes redirect.
- Forms: validate with the zod schemas from `@emdia/shared`; show field errors from `details.fieldErrors` on a 400.
- `<dialog>` with `showModal()` gives focus trapping and Esc handling for bottom sheets.
- Never use `v-html`; the harness fails on it.
- Layering for imports is in [ARCHITECTURE](../ARCHITECTURE.md#web-layering).
- Verify version-specific behavior against the installed package, not memory: check `apps/web/node_modules/vue/package.json`.
