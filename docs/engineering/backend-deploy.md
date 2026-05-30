# Backend deployment (Docker Compose)

The recommended way to run the backend yourself is the bundled Docker Compose
stack. You get the API on `:3000` and (optionally) Postgres on `:5432`.

## Prerequisites

- Docker 24+ and Docker Compose v2
- Around 200 MB of disk for the image and a few MB for the database

## Quick start (SQLite)

```sh
git clone https://github.com/mbianchidev/fire-tools.git
cd fire-tools
docker compose build --no-cache
docker compose up -d backend
curl http://localhost:3000/api/v1/health
```

You should get back `{"status":"ok"}`. The SQLite file lives in the
`fire-tools-data` named volume so it survives restarts.

## With Postgres

Postgres is gated behind a Compose profile so you only pay the cost when you
want it:

```sh
docker compose --profile postgres build --no-cache
docker compose --profile postgres up -d
```

Compose starts a `postgres:16-alpine` container and points the backend at it
via `DATABASE_URL`. The schema in
[`docs/database/schema.sql`](../database/README.md) is Postgres-compatible and
the same migrations work against both engines.

## Environment variables

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PORT` | `3000` | HTTP port the API listens on |
| `DATABASE_URL` | `sqlite:./data/fire-tools.db` | Storage URL. Use `postgres://...` for Postgres. |
| `DATA_DIR` | `./data` | Directory for the SQLite file (ignored for Postgres) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `CORS_ORIGIN` | `*` | Comma-separated allowlist for CORS |

Override in `docker-compose.yml` or by exporting them in your shell before
`docker compose up`.

## Persistence

The default `docker-compose.yml` declares two named volumes:

- `fire-tools-data` — the SQLite database (or the Postgres `pgdata`)
- `fire-tools-logs` — backend logs (rotated)

Back them up with `docker run --rm -v fire-tools-data:/data -v $(pwd):/backup
alpine tar czf /backup/fire-tools-data.tgz /data`.

## Reverse proxy / TLS

The backend listens on plain HTTP. Put it behind Caddy, Traefik or Nginx and
terminate TLS there. The OpenAPI spec assumes the API is mounted at
`/api/v1/`; if your proxy rewrites the path, update the `servers` block in
`docs/api/openapi.yaml` to match before generating clients.

## Health checks

`GET /api/v1/health` returns `200 {"status":"ok"}` once the database is
reachable and migrations are up to date. Wire it into your orchestrator's
liveness probe.

## Updating

```sh
git pull
docker compose build --no-cache
docker compose up -d
```

Migrations run on startup. See [migrations & rollbacks](./migrations.md) for
how to undo a bad release.
