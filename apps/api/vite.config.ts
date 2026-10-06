import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/server.ts", "src/vercel.ts"],
    format: "esm",
    platform: "node",
    target: "node24",
    sourcemap: true,
    deps: { alwaysBundle: ["@emdia/shared"] },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
