# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    DATABASE_URL=file:/data/firetools.db \
    MIGRATIONS_PATH=/app/migrations
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --gid 0 --shell /usr/sbin/nologin firetools \
    && mkdir -p /data /app/migrations \
    && chown -R firetools:0 /data /app
COPY --from=build --chown=firetools:0 /app/node_modules ./node_modules
COPY --from=build --chown=firetools:0 /app/dist ./dist
COPY --from=build --chown=firetools:0 /app/package.json ./package.json
COPY --chown=firetools:0 server/migrations ./migrations
USER firetools
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
