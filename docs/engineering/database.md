# Database & schema

The backend treats SQLite as a **first-class** storage target and keeps the
schema **Postgres-compatible** so the same DDL runs on both engines.

- DDL: [`docs/database/schema.sql`](https://github.com/mbianchidev/fire-tools/blob/main/docs/database/schema.sql)
- Design notes + ERD: [`docs/database/README.md`](https://github.com/mbianchidev/fire-tools/blob/main/docs/database/README.md)

## Why SQLite first?

Fire Tools is local-first. A single file you can back up by copying it beats
a database server you have to run. SQLite handles the load with room to
spare for a single household's worth of data.

We keep the schema Postgres-compatible so you can graduate to a server when
you genuinely need to share the deploy with a few users.

## Conventions

- All tables carry `id TEXT PRIMARY KEY` (UUIDs).
- All domain rows carry `user_id TEXT NOT NULL REFERENCES users(id)` so the
  schema is already multi-tenant-ready.
- All enums are expressed as `TEXT` columns with `CHECK (col IN (...))`. This
  works identically in SQLite and Postgres.
- All tables track `created_at` and `updated_at` as ISO-8601 strings.
- Foreign keys are enabled (`PRAGMA foreign_keys = ON` in SQLite; native in
  Postgres) and use `ON DELETE CASCADE` where the child has no meaning
  without the parent.

## Validating the schema

```sh
# parse against SQLite
sqlite3 :memory: < docs/database/schema.sql

# (Postgres is exercised by the integration tests under the `postgres` profile)
```

## Adding a column / table

Whenever you change `docs/database/schema.sql` you **must** update:

1. The matching schema in [`docs/api/openapi.yaml`](https://github.com/mbianchidev/fire-tools/blob/main/docs/api/openapi.yaml).
2. The matching TypeScript interface or union in [`src/types/*.ts`](https://github.com/mbianchidev/fire-tools/tree/main/src/types).
3. A migration file with a **rollback** companion — see
   [migrations & rollbacks](./migrations.md).

Without all three the contract drifts away from the storage and the client.
The PR template reminds you of this checklist.

## Choosing SQLite vs Postgres

| Use case | Pick |
| -------- | ---- |
| Personal install on one machine | SQLite |
| Family / small household, multiple devices on a LAN | SQLite is still fine |
| Many concurrent writers (rare in this app) | Postgres |
| You already run a Postgres for other apps | Postgres |

Switching is a `DATABASE_URL` change plus a dump-restore. The schema is the
same.
