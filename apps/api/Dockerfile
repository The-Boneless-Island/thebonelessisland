# API container — Node 22 LTS Alpine, single-stage for beta simplicity.
# Runs the TypeScript source directly via tsx so we don't need a separate
# compile step. Multi-stage with tsc build is a future optimization once
# image size matters more than build complexity.
#
# Build from repo root:
#   docker build -f apps/api/Dockerfile -t boneless-api:latest .
#
# Run (env injection at deploy time — never bake secrets into the image):
#   docker run -d --env-file .env -p 3000:3000 boneless-api:latest

FROM node:22-alpine

# Patch OS packages (e.g. libcrypto3/libssl3) to the latest alpine release so
# the image doesn't ship known-fixed CVEs the base tag hasn't picked up yet.
RUN apk upgrade --no-cache

# tini is a minimal init process that reaps zombies and forwards signals
# correctly — Node alone misbehaves as PID 1 (Ctrl+C / SIGTERM gets ignored).
RUN apk add --no-cache tini

WORKDIR /app

# Copy workspace manifests first so the npm install layer caches when only
# source changes. This keeps incremental rebuilds fast.
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --include=dev

# Copy source for the workspaces this image actually runs.
COPY tsconfig*.json ./
COPY packages packages
COPY apps/api apps/api

# Run as non-root. node:22-alpine ships with the `node` user (uid 1000).
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 3000

# Run from the app workspace. Migrations + dotenv both resolve relative to
# their own modules now, so nothing depends on this cwd — it just keeps the
# CMD path short and matches how the app is run locally.
WORKDIR /app/apps/api

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/server.ts"]
