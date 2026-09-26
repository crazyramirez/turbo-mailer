# syntax=docker/dockerfile:1

# ── Build ───────────────────────────────────────────────────────────────
# Native modules (better-sqlite3, sharp) are compiled for the same Debian
# base the runtime uses, so the traced .output bundle runs as-is.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app

COPY --from=build --chown=node:node /app/.output ./.output
# Demo assets ship with the image; runtime data lives in the /data volume
COPY --from=build --chown=node:node /app/data/demo ./data/demo
COPY --from=build --chown=node:node /app/data/turbomailer_demo.db ./data/turbomailer_demo.db
RUN mkdir -p /data && chown -R node:node /data /app

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# A single long-lived process: campaign sends and the scheduler run inside it
CMD ["node", ".output/server/index.mjs"]
