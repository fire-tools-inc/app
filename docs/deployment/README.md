# Local Docker Compose deployment

Covers issues
[#129](https://github.com/mbianchidev/fire-tools/issues/129) (decouple +
containerize) and
[#195](https://github.com/mbianchidev/fire-tools/issues/195) (local
database).

> **Status: scaffold.** The backend currently implements `GET /health`
> and `GET /users/me` against SQLite and returns `501 not_implemented`
> for the rest of the OpenAPI contract. The compose stack is wired so
> the rest can be filled in iteratively without changing the topology.

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

| Var            | Default                          | Notes |
|----------------|----------------------------------|-------|
| `NODE_ENV`     | `production`                     | |
| `PORT`         | `8787`                           | Inside the container. |
| `HOST`         | `0.0.0.0`                        | Bind address. |
| `DATABASE_URL` | `file:/data/firetools.db`        | `file:` SQLite or `postgres://…` |
| `SCHEMA_PATH`  | `/app/schema/schema.sql`         | Applied only on a fresh DB. |
| `CORS_ORIGIN`  | `http://localhost:8080`          | Set to your frontend origin. |

## Volumes & backup

The SQLite DB lives in the `firetools-data` named volume mounted at
`/data` inside the backend. Backup is a plain file copy:

```sh
docker compose cp backend:/data/firetools.db ./firetools-backup.db
```

## Troubleshooting

- **`501 not_implemented` for most endpoints** — expected. Only `/health`
  and `/users/me` are wired. Fill in the rest by adding routers under
  `server/src/routes/` and mounting them in `server/src/index.ts`
  before the catch-all.
- **better-sqlite3 build errors in CI** — the Dockerfile installs
  `python3` + `build-essential` precisely to handle the node-gyp
  fallback. If you build outside Docker, ensure those are present.
- **CORS errors from the browser** — set `CORS_ORIGIN` to the exact
  scheme+host+port serving the frontend.
