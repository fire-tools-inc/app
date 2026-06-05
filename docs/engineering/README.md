# Fire Tools — Engineering documentation

This section is for developers and operators who want to **self-host the
backend**, **build a custom client**, or **understand the internals**. If
you're a regular user, you probably want the [user guide](../user/README.md)
instead.

## Pages in this section

- [Backend deployment (Docker Compose)](./backend-deploy.md)
- [API & custom clients (OpenAPI)](./api-client.md)
- [Database & schema](./database.md)
- [Migrations & rollbacks](./migrations.md)
- [Logging & PII handling](./logging.md)
- [Cutting a release](./releasing.md)

## Architecture at a glance

```
+----------------+        +----------------+        +----------------+
|  Web / Electron| <----> |  Node.js API   | <----> |  SQLite (def.) |
|     client     |  HTTP  |   Express +    |  SQL   |  or Postgres   |
|  (React, Vite) |        |    OpenAPI     |        |   (compose)    |
+----------------+        +----------------+        +----------------+
```

- **Client** — the React app under `src/`. Built with Vite. Identical bundle
  ships to the web (`dist/`), the desktop apps (Electron loads `dist/`), and
  any third-party client you build on top of the OpenAPI contract.
- **Backend** — a small Node.js + Express service in `server/`. SQLite is the
  default storage; Postgres is supported via a Docker Compose profile.
- **Contract** — [OpenAPI 3.0.3](https://github.com/mbianchidev/fire-tools/blob/main/docs/api/openapi.yaml).
  Source of truth for both server routes and any generated client. Also
  published at [`/fire-tools/api/`](https://mbianchidev.github.io/fire-tools/api/).

## Why a local-first backend?

Most FIRE tools either run entirely client-side (data trapped in one browser)
or fully cloud-hosted (third party sees your finances). Fire Tools' backend
is meant to run **on your own machine** (Docker Desktop, your homelab,
whatever) so your data stays on your hardware while still being reachable
from multiple devices on your network.

The same code can be deployed multi-tenant — every domain table already
carries `user_id` — but the default configuration boots a single user so you
don't need to think about auth on day one.

## Source map

| Path | Purpose |
| ---- | ------- |
| `src/` | React + TypeScript frontend (Vite) |
| `server/` | Node.js + Express + better-sqlite3 backend |
| `electron/` | Electron main + preload (desktop wrapper) |
| `website/` | Marketing landing page |
| `docs/api/` | OpenAPI contract + Redocly config |
| `docs/database/` | DDL + ERD notes |
| `docs/deployment/` | Docker Compose how-tos |
| `docs/user/` | End-user documentation (this site's `/docs/user/`) |
| `docs/engineering/` | Engineering documentation (this site's `/docs/engineering/`) |

## Related links

- [Project README](https://github.com/mbianchidev/fire-tools)
- [Issue tracker](https://github.com/mbianchidev/fire-tools/issues)
- [Live OpenAPI viewer](https://mbianchidev.github.io/fire-tools/api/)
- [Mobile repo plan](https://github.com/mbianchidev/fire-tools/blob/main/docs/mobile/README.md)
