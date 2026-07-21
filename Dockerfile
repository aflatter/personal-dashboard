# syntax=docker/dockerfile:1
#
# Backend image: the always-on service (JMAP + Toggl + tRPC + the built SPA,
# served same-origin). Node 26 type-strips the .ts sources directly — no compile
# step for the backend; only the SPA is built (vite). Build on the Mac with
# OrbStack using --platform linux/amd64 (the k3s cluster is x86_64); see the
# justfile. Not size-optimised (the runtime keeps the full workspace) — fine for
# a single-user service.

FROM node:26-slim AS build
WORKDIR /app
RUN corepack enable
# Manifests first, for a cached install layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/collector/package.json packages/collector/
COPY packages/backend/package.json packages/backend/
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/agent/package.json packages/agent/
RUN pnpm install --frozen-lockfile
# Sources (see .dockerignore), then build the SPA.
COPY . .
RUN pnpm --filter @dash/dashboard build

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
# The container reads Fastmail/Toggl from env (a k8s Secret) — no secretspec in
# the pod. The SPA is served same-origin from DASHBOARD_DIST. The SQLite file
# lives on the mounted volume (the k8s PVC), seeded on first boot.
ENV COLLECTOR_HOST=0.0.0.0 \
    COLLECTOR_PORT=4319 \
    COLLECTOR_DB=/data/collector.db \
    DASHBOARD_DIST=/app/packages/dashboard/dist
EXPOSE 4319
VOLUME ["/data"]
CMD ["node", "packages/backend/src/main.ts"]
