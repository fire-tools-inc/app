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

SQL migrations live in [`migrations/`](./migrations). Each migration ships
as a pair of files: `NNNN_name.up.sql` (apply) and `NNNN_name.down.sql`
(rollback). For every `CREATE TABLE` in the up file there is a matching
`DROP TABLE IF EXISTS` in the down file (same for `CREATE INDEX`,
`ALTER TABLE ADD COLUMN`, etc.) so that any change can be safely reverted.

The up migrations run automatically on boot. You can also drive them by
hand:

```sh
npm run migrate           # apply all pending migrations
npm run migrate:status    # show applied/pending state
npm run migrate:down      # roll back the most recent migration
npm run migrate:down -- 2 # roll back the last 2 migrations
npm run migrate:down -- all  # roll back every applied migration
```

Each up/down runs inside a SQLite transaction; a failure leaves earlier
migrations untouched. A `schema_migrations` table tracks which files ran.
To start completely fresh, delete the file referenced by `DATABASE_URL`
and boot again, or run `npm run migrate:down -- all` followed by
`npm run migrate`.

## Settings JSON mirror

User preferences live in the `user_settings` and `notification_preferences`
tables (DB is source of truth) and are also mirrored to a sibling file
`settings.json` placed next to the SQLite database. In Electron this lands
in the platform user data folder, alongside `firetools.db`.

- Writes are atomic: temp file + `fsync` + rename, mode `0o600`.
- Boot performs a one-shot legacy filename migration
  (`firetools-settings.json`, `fire-tools-settings.json`,
  `preferences.json` → `settings.json`) and then syncs DB → JSON.
- A corrupt JSON file is quarantined as `settings.json.corrupt-<ts>`
  and a fresh file is written from the DB.
- In-memory DBs (tests) skip the file mirror entirely.

Endpoints:

| Method | Path                    | Purpose                                              |
|--------|-------------------------|------------------------------------------------------|
| GET    | `/settings/file`        | Return absolute path, `exists`, and parsed contents  |
| POST   | `/settings/file/sync`   | Force re-sync of DB → `settings.json`                |
| POST   | `/settings/file/import` | Apply a settings file payload into the DB            |

`import` is strict for `notificationPreferences` (all fields required, same
as `PUT /settings/notifications`) but accepts partial `settings` patches.
See [`../docs/api/openapi.yaml`](../docs/api/openapi.yaml).

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
