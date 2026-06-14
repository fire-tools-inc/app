# Local Docker Compose deployment

Covers issues
[#129](https://github.com/fire-tools-inc/app/issues/129) (decouple +
containerize) and
[#195](https://github.com/fire-tools-inc/app/issues/195) (local
database).

The backend implements the full OpenAPI contract against SQLite. Migrations
are forward-only SQL files in [`../../server/migrations/`](../../server/migrations/)
and run automatically on boot (also runnable via `npm run migrate`).

## Stack

- `backend` — Node + Express + better-sqlite3, image built from
  [`server/Dockerfile`](../../server/Dockerfile).
- `frontend` — Vite SPA + landing page served by nginx-alpine, image
  built from [`docker/frontend.Dockerfile`](../../docker/frontend.Dockerfile).
  Proxies `/api/*` to the backend on the internal network.
- `postgres` *(profile)* — Postgres 17 for users who don't want SQLite.

## Quick start

```sh
# Always build with no cache (per repo conventions).
docker compose build --no-cache

# Start backend + frontend (SQLite, persistent volume).
docker compose up -d

# UI: http://localhost:8080
# API: http://localhost:8080/api/v1/health
```

Stop and clean:

```sh
docker compose down            # keep data
docker compose down -v         # nuke volumes too
```

## Switching to Postgres

The database driver is selected at runtime from `DATABASE_URL`:

- `file:/data/firetools.db` → SQLite (default)
- `postgres://user:pass@host:5432/db` → Postgres *(not yet wired in the
  server scaffold; the env switch is in place so it slots in
  without changes to the compose stack)*

```sh
docker compose --profile postgres up -d
# then point backend DATABASE_URL at the postgres service:
#   DATABASE_URL=postgres://firetools:firetools@postgres:5432/firetools
```

## Environment

| Var                    | Default                          | Notes |
|------------------------|----------------------------------|-------|
| `NODE_ENV`             | `production`                     | |
| `PORT`                 | `8787`                           | Inside the container. |
| `HOST`                 | `0.0.0.0`                        | Bind address. |
| `DATABASE_URL`         | `file:/data/firetools.db`        | `file:` SQLite or `postgres://…` |
| `MIGRATIONS_PATH`      | `migrations`                     | Relative to `server/` or absolute. |
| `CORS_ORIGIN`          | `http://localhost:8080`          | Comma-separated allowlist. |
| `CORS_ALLOW_ALL`       | `false`                          | `true` opens CORS — only for trusted local stacks. |
| `RATE_LIMIT_WINDOW_MS` | `900000`                         | Sliding window for the rate limiter. |
| `RATE_LIMIT_MAX`       | `300`                            | Max requests per window per IP. |

## Volumes & backup

The SQLite DB lives in the `firetools-data` named volume mounted at
`/data` inside the backend. Backup is a plain file copy:

```sh
docker compose cp backend:/data/firetools.db ./firetools-backup.db
```

## Troubleshooting

- **better-sqlite3 build errors in CI** — the Dockerfile installs
  `python3` + `build-essential` precisely to handle the node-gyp
  fallback. If you build outside Docker, ensure those are present.
- **CORS errors from the browser** — set `CORS_ORIGIN` to the exact
  scheme+host+port serving the frontend, or set `CORS_ALLOW_ALL=true`
  for trusted local-only stacks.
- **`429 Too Many Requests`** — bump `RATE_LIMIT_MAX` /
  `RATE_LIMIT_WINDOW_MS` to fit your usage profile.
