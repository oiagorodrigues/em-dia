# syntax=docker/dockerfile:1

# vp (pack/build) runs on Node, so the bun stages borrow the Node binary.
FROM node:24-slim AS node

FROM oven/bun:1.4.2 AS base
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/e2e/package.json tools/e2e/
COPY tools/harness/package.json tools/harness/

FROM base AS build
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bunx vp run --filter @emdia/api build && bunx vp run --filter @emdia/web build

FROM base AS prod-deps
RUN bun install --frozen-lockfile --ignore-scripts --production --filter @emdia/api

FROM node:24-slim AS runtime
# Without a Postgres DATABASE_URL (see compose.yaml) the app falls back to embedded PGlite in the volume.
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=pglite:/data/pglite \
    UPLOAD_DIR=/data/uploads \
    WEB_DIST_DIR=/app/apps/web/dist
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
STOPSIGNAL SIGTERM
# Migrations first (advisory-locked, so several replicas starting together are fine), then the server.
CMD ["sh", "-c", "node apps/api/dist/scripts/migrate.mjs && exec node apps/api/dist/server.mjs"]
