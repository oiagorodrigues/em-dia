# Vite+ notes

Local docs: `node_modules/vite-plus/docs/guide/`. CLI is `vp` (global, `~/.vite-plus/bin/vp`).

| Command                         | Use here                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `vp install`                    | Install dependencies (we use bun as package manager)                            |
| `vp check`                      | Format (oxfmt), lint (oxlint) and type check in one pass. `--fix` applies fixes |
| `vp lint` / `vp fmt`            | Lint or format alone; accept paths, e.g. `vp lint tools docs`                   |
| `vp test`                       | Vitest through `vite-plus/test`; run inside a package or via `vp run -r test`   |
| `vp dev` / `vp build`           | Vite dev server and production build (web)                                      |
| `vp pack`                       | Library/server bundling with tsdown (api build)                                 |
| `vp run <script>`               | Run a package.json script or `vite.config.ts` task, with caching                |
| `vp run -r <script>`            | Run in every workspace package, in dependency order                             |
| `vp run --parallel -r <script>` | No ordering, unlimited concurrency; used for `dev`                              |
| `vp run -F <pkg> <script>`      | Run in one package, e.g. `-F @emdia/api`                                        |

Facts that matter:

- `vp <name>` is a built-in; `vp run <name>` is a script. `vp dev` and `vp run dev` differ.
- Import test helpers from `vite-plus/test`, not `vitest`. A lint rule (`prefer-vite-plus-imports`) enforces `vite-plus` imports.
- Lint and format config sits in the root `vite.config.ts`; packages cannot override it.
- There is no ESLint or Prettier. The harness fails if either appears in a manifest.
- Task results are cached; use `--no-cache` when debugging a flaky run.
