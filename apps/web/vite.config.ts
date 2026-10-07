import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite-plus";

const INK = "#15171C";
const API_TARGET = `http://localhost:${process.env.API_PORT ?? "3000"}`;
const PAPER = "#FAF7F2";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "logo.svg"],
      manifest: {
        name: "em dia — diárias e mensalistas",
        short_name: "em dia",
        description: "Horas, faltas e pagamentos de quem trabalha na sua casa.",
        lang: "pt-BR",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: INK,
        background_color: PAPER,
        categories: ["productivity", "finance"],
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "screenshots/narrow-inicio.png",
            sizes: "390x844",
            type: "image/png",
            form_factor: "narrow",
            label: "Bater o ponto e ver quanto falta receber no mês",
          },
          {
            src: "screenshots/wide-inicio.png",
            sizes: "1280x800",
            type: "image/png",
            form_factor: "wide",
            label: "Horas e valores do mês de quem trabalha na sua casa",
          },
        ],
        shortcuts: [
          {
            name: "Bater ponto",
            short_name: "Bater ponto",
            url: "/?bater=1",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,svg,png,ico}",
          "**/*-latin-*.woff2",
          "**/*-latin-ext-*.woff2",
        ],
        // Install-UI screenshots are only fetched by the browser installer, never by the app.
        globIgnores: ["screenshots/**"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith("/api/"), handler: "NetworkOnly" },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { "/api": { target: API_TARGET, changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { "/api": { target: API_TARGET, changeOrigin: false } },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
