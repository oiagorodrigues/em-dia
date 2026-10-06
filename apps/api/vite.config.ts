import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/server.ts", "src/vercel.ts", "src/scripts/migrate.ts"],
    format: "esm",
    platform: "node",
    target: "node24",
    sourcemap: true,
    deps: { alwaysBundle: ["@emdia/shared"] },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Booting an in-memory PGlite (WASM Postgres) takes a few seconds when files run in parallel.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
