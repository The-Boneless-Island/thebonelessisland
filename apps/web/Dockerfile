# Web image — multi-stage. Stage 1 builds the Vite SPA; stage 2 is Caddy
# serving that static build + reverse-proxying the API. This single image is
# the public edge on the box (behind Cloudflare).
#
# Build from repo root (the build context is the monorepo root so the web
# workspace can resolve @island/shared):
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_BASE_URL=https://api.bonelessisland.com \
#     -t boneless-web:latest .
#
# VITE_API_BASE_URL is baked in at BUILD time (Vite inlines import.meta.env.*).
# Changing the API URL requires a rebuild, not just a restart.

# ── Stage 1: build the static bundle ────────────────────────────────────────
# Node 22 LTS: required by rollup-plugin-visualizer (ANALYZE builds) and the
# precompression plugins.
FROM node:22-alpine AS build

# Patch OS packages (e.g. libcrypto3/libssl3) to the latest alpine release so
# the build stage doesn't carry known-fixed CVEs the base tag hasn't picked up.
RUN apk upgrade --no-cache

WORKDIR /app

# Workspace manifests first for a cacheable install layer.
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --include=dev

COPY tsconfig*.json ./
COPY packages packages
COPY apps/web apps/web

# vite.config.ts sets envDir to the repo root ("../../" from apps/web), so the
# build reads .env there. Materialize the build-time API URL into that file
# from the build arg. Default keeps local builds pointed at localhost.
ARG VITE_API_BASE_URL=http://localhost:3000
RUN printf "VITE_API_BASE_URL=%s\n" "$VITE_API_BASE_URL" > .env

RUN npm run build -w @island/web

# ── Stage 2: serve ──────────────────────────────────────────────────────────
FROM caddy:2-alpine

# Patch OS packages in the runtime image too (caddy:2-alpine ships its own
# alpine base) so the public edge image stays CVE-clean.
RUN apk upgrade --no-cache

# Static build → Caddy web root.
COPY --from=build /app/apps/web/dist /srv
# Caddy config (serves /srv + proxies api). Edit infra/Caddyfile then rebuild.
COPY infra/Caddyfile /etc/caddy/Caddyfile

# The base image's default entrypoint runs:
#   caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 80 443
