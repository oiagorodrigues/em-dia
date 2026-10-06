# Vue 3.6 notes

- Use `<script setup lang="ts">`, `defineProps`, `defineEmits`, `defineModel` for two-way props.
- Reactivity: `ref` and `computed` for local state; Pinia setup stores for shared state.
- Vue 3.6 introduces Vapor mode as opt-in; this project uses the standard virtual DOM renderer. Do not mix Vapor components in without a decision-log entry.
- Router: `vue-router` with route guards reading the auth store. Role-specific routes redirect.
- Forms: validate with the zod schemas from `@ponto/shared`; show field errors from `details.fieldErrors` on a 400.
- `<dialog>` with `showModal()` gives focus trapping and Esc handling for bottom sheets.
- Never use `v-html`; the harness fails on it.
- Layering for imports is in [ARCHITECTURE](../ARCHITECTURE.md#web-layering).
- Verify version-specific behavior against the installed package, not memory: check `apps/web/node_modules/vue/package.json`.
