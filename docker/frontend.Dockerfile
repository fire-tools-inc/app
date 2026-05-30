# Multi-stage build for the SPA + landing page served via nginx-alpine.
# Build context MUST be the repo root (see docker-compose.yml).

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install deps first to leverage Docker layer cache. Skip lifecycle scripts —
# the frontend image only needs `vite build`, not Electron or better-sqlite3
# native rebuilds (those run via root postinstall on developer machines).
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi

# Then the rest of the source.
COPY . .
RUN npm run build && npm run build:landing

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
