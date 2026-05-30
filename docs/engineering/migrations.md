# Migrations & rollbacks

Every schema change ships as a pair of files: **forward** (`up`) and
**rollback** (`down`). Both are mandatory. A change without a rollback gets
rejected at code review.

## Directory layout

```
server/migrations/
├── 0001_create_users.up.sql
├── 0001_create_users.down.sql
├── 0002_add_settings.up.sql
├── 0002_add_settings.down.sql
└── ...
```

The runner sorts files by their numeric prefix. Use four-digit zero-padded
prefixes so the lexicographic order matches the numeric one.

## Rules

For every `up`, write a matching `down`:

| `up` does | `down` must do |
| --------- | -------------- |
| `CREATE TABLE foo (...)` | `DROP TABLE foo` |
| `ALTER TABLE foo ADD COLUMN bar` | `ALTER TABLE foo DROP COLUMN bar` |
| `CREATE INDEX idx_foo_bar ON foo(bar)` | `DROP INDEX idx_foo_bar` |
| Data backfill | An inverse data migration where possible, or a documented warning if the loss is acceptable |

A `down` that loses data must say so in a header comment, e.g.

```sql
-- WARNING: this rollback drops the `categories` table and all rows in it.
DROP TABLE categories;
```

## Running migrations

```sh
# from the server/ directory
npm run migrate         # run all pending up migrations
npm run migrate:status  # show which migrations have run
npm run migrate:down    # roll back the most recent migration
npm run migrate:down -- --to 0003  # roll back to (and including) 0003
```

The Docker entrypoint runs `npm run migrate` automatically on startup so
fresh deploys converge to the latest schema with no manual step.

## How the runner works

- Connects with the same `DATABASE_URL` the server uses (so SQLite and
  Postgres are handled by the same code path).
- Creates a `schema_migrations` table on first run (`id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL`).
- For `up`: for each `*.up.sql` whose id is not in `schema_migrations`,
  executes the file inside a transaction and inserts a row.
- For `down`: looks up the most recent applied migration (or the chain back
  to `--to`), executes the matching `*.down.sql` inside a transaction and
  deletes the row.

If a migration fails, the transaction is rolled back and the runner exits
non-zero. Logs show the offending statement.

## Rolling back a bad release

```sh
# stop traffic
docker compose stop backend

# roll back the schema to the previous known-good state
docker compose run --rm backend npm run migrate:down

# deploy the previous container image
docker compose pull backend
docker compose up -d backend
```

If you keep release tags around (recommended), `docker compose` will pull the
prior image and the `down` migration leaves the database matching it.

## Why both engines see the same migrations

Because we only use the subset of SQL that's compatible with both SQLite and
Postgres (no `JSONB`, no engine-specific types, enums expressed as
`TEXT CHECK (col IN (...))`). Anything more exotic stays out of the
migrations.
