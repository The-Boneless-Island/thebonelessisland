# Bot container — Node 22 LTS Alpine, single-stage. Same shape as the API
# image but smaller copy set since the bot doesn't need apps/web or migrations.
#
# Build from repo root:
#   docker build -f apps/bot/Dockerfile -t boneless-bot:latest .
#
# Run (the bot has no inbound listener — outbound only to Discord gateway):
#   docker run -d --env-file .env boneless-bot:latest

FROM node:22-alpine

# Patch OS packages (e.g. libcrypto3/libssl3) to the latest alpine release so
# the image doesn't ship known-fixed CVEs the base tag hasn't picked up yet.
RUN apk upgrade --no-cache

RUN apk add --no-cache tini

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci --include=dev

COPY tsconfig*.json ./
COPY packages packages
COPY apps/bot apps/bot

RUN chown -R node:node /app
USER node

ENV NODE_ENV=production

WORKDIR /app/apps/bot

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/index.ts"]
