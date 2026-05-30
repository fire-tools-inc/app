# Fire Tools — Backend

Local-deployment backend for Fire Tools. Implements the OpenAPI contract at
[`../docs/api/openapi.yaml`](../docs/api/openapi.yaml) end-to-end against
SQLite. PostgreSQL profile is wired in compose but the driver itself isn't
implemented yet — see issue [#195](https://github.com/mbianchidev/fire-tools/issues/195).

Covers issues
[#129](https://github.com/mbianchidev/fire-tools/issues/129),
[#195](https://github.com/mbianchidev/fire-tools/issues/195).

## Stack

- Node.js 22, ESM, TypeScript strict
- Express 4
- `better-sqlite3` (synchronous, no native server, perfect for single-user
  local deployments)
- `express-rate-limit` + strict CORS allowlist

## Develop

```sh
cd server
npm install
npm run dev
# server on http://localhost:8787
curl http://localhost:8787/api/v1/health
```

## Migrations

Forward-only SQL migrations live in [`migrations/`](./migrations). They are
applied automatically on boot, but you can also run them manually:

```sh
npm run migrate           # apply all pending migrations
npm run migrate:status    # show applied/pending state
```

A `schema_migrations` table tracks which files ran. To start fresh, delete the
file referenced by `DATABASE_URL` and boot again.

## Tests

```sh
npm test
```

Integration tests boot the full Express app against an in-memory SQLite with
all migrations applied, then exercise the routers via `supertest`.

## Configuration

| Env var               | Default                         | Notes                                                                 |
|-----------------------|---------------------------------|-----------------------------------------------------------------------|
| `PORT`                | `8787`                          | HTTP port                                                             |
| `HOST`                | `0.0.0.0`                       | Bind address                                                          |
| `DATABASE_URL`        | `file:./data/firetools.db`      | Only `file:` (SQLite) is implemented today                            |
| `MIGRATIONS_PATH`     | `migrations`                    | Relative to `server/` (absolute paths also supported)                 |
| `CORS_ORIGIN`         | dev: localhost:5173/8080        | Comma-separated allowlist. Empty in production = no cross-origin.    |
| `CORS_ALLOW_ALL`      | `false`                         | Set to `true` only for trusted local-only deployments                |
| `RATE_LIMIT_WINDOW_MS`| `900000` (15 min)               | Sliding window for rate limiter                                       |
| `RATE_LIMIT_MAX`      | `300`                           | Max requests per window per IP                                        |
| `NODE_ENV`            | `development`                   | `production` in Docker                                                |

## Build & run

```sh
npm run build
npm start
```

## Docker

Built and orchestrated by the repo-level [`../docker-compose.yml`](../docker-compose.yml).
See [`../docs/deployment/README.md`](../docs/deployment/README.md).
