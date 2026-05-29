# Fire Tools — Backend (scaffold)

Local-deployment backend for Fire Tools. Implements the OpenAPI contract at
[`../docs/api/openapi.yaml`](../docs/api/openapi.yaml). SQLite is the
first-class storage (PostgreSQL profile is wired in compose but the driver
itself isn't implemented yet — see issue [#195](https://github.com/mbianchidev/fire-tools/issues/195)).

> **Status — scaffold.** Only `GET /api/v1/health` and `GET /api/v1/users/me`
> have real handlers. Every other path in the OpenAPI spec replies with
> `501 not_implemented` so clients can detect and skip. This is intentional —
> the goal of this PR is to land the structure end-to-end (issues
> [#129](https://github.com/mbianchidev/fire-tools/issues/129),
> [#195](https://github.com/mbianchidev/fire-tools/issues/195)). Full
> implementation lands in follow-up PRs.

## Stack

- Node.js 22, ESM, TypeScript strict
- Express 4
- `better-sqlite3` (synchronous, no native server, perfect for single-user
  local deployments)

## Develop

```sh
cd server
npm install
npm run dev
# server on http://localhost:8787
curl http://localhost:8787/api/v1/health
```

Schema is loaded from `../docs/database/schema.sql` on **first** boot
(when the database file does not exist yet). To recreate, just delete the
file referenced by `DATABASE_URL` and restart.

## Configuration

| Env var        | Default                         | Notes                                              |
|----------------|---------------------------------|----------------------------------------------------|
| `PORT`         | `8787`                          | HTTP port                                          |
| `HOST`         | `0.0.0.0`                       | Bind address                                       |
| `DATABASE_URL` | `file:./data/firetools.db`      | Only `file:` (SQLite) is implemented today         |
| `SCHEMA_PATH`  | `../docs/database/schema.sql`   | Relative to `server/dist/` at runtime              |
| `CORS_ORIGIN`  | `*`                             | Tighten in production                              |
| `NODE_ENV`     | `development`                   | `production` in Docker                             |

## Build & run

```sh
npm run build
npm start
```

## Docker

Built and orchestrated by the repo-level [`../docker-compose.yml`](../docker-compose.yml).
See [`../docs/deployment/README.md`](../docs/deployment/README.md).
