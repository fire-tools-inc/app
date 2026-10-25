# syntax=docker/dockerfile:1.7

FROM node:26.12.1-bookworm-slim AS build
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
# Bundled Node-API binaries and tsc need no lifecycle scripts; older npm would
# otherwise attempt an unnecessary implicit node-gyp build.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/scripts ./scripts
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && node -e "const fs = require('node:fs'); const dir = 'node_modules/better-sqlite3/prebuilds'; const keep = 'linux-' + process.arch + '.node'; for (const file of fs.readdirSync(dir)) { if (file !== keep) fs.unlinkSync(dir + '/' + file); } const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close();"

FROM node:26.12.1-bookworm-slim AS runtime
ARG GIT_COMMIT_HASH=unknown
ARG BUILD_TIME
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    DATABASE_URL=file:/data/firetools.db \
    MIGRATIONS_PATH=/app/migrations \
    GIT_COMMIT_HASH=${GIT_COMMIT_HASH} \
    BUILD_TIME=${BUILD_TIME}
WORKDIR /app
RUN useradd --system --uid 10001 --key SYS_UID_MAX=10001 --gid 0 --shell /usr/sbin/nologin firetools \
    && mkdir -p /data /app/migrations \
    && chown -R firetools:0 /data /app
COPY --from=build --chown=firetools:0 /app/node_modules ./node_modules
COPY --from=build --chown=firetools:0 /app/dist ./dist
COPY --from=build --chown=firetools:0 /app/tessdata ./tessdata
COPY --from=build --chown=firetools:0 /app/package.json ./package.json
COPY --chown=firetools:0 server/migrations ./migrations
COPY --chown=firetools:0 server/public ./public
USER firetools
EXPOSE 8787 8790
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
