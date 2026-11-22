# Agent API and storage sync

Fire Tools exposes one REST API (`/api/v1`, described in
[OpenAPI](https://fire-tools-inc.github.io/app/api/)) for the app itself, AI
agents and custom clients. Whatever a client writes through it is what the
app shows: the database is the source of truth whenever a backend is
reachable.

## Storage model

| Mode | Source of truth | Renderer storage |
| --- | --- | --- |
| Desktop (embedded backend) | SQLite in the profile directory | Encrypted cache plus outbox |
| Web or desktop with a custom backend URL | That backend's database | Encrypted cache plus outbox |
| Web without a backend | Encrypted browser storage | Authoritative, as before |
| Public demo | Bundled sample data | Read-only |

Five domains are synchronized: preferences (`settings`), FIRE calculator
(`calculator`), Asset Allocation (`assetAllocation`), Cashflow
(`expenseTracker`) and Net Worth (`netWorth`). Scenarios, debt payoff plans,
the audit log, notifications, questionnaire results and navigation state stay
in the renderer. Device settings never leave the device: backend address and
token, updater, logging and AI model settings (including API keys).

### How a change travels

1. A page saves through the existing `saveXxx()` helper. The helper writes the
   encrypted cache, diffs the new document against the last known one and
   appends an entity-level changeset to a persisted outbox.
2. The sync engine (`src/utils/backendSync/`) sends queued changesets with
   `PATCH /state/{domain}`, retrying with backoff while offline. A rejected
   change (4xx) is listed in Settings with the server's reason and the domain
   is reloaded from the database.
3. Every write to a domain table, from any route, bumps that domain's revision
   through SQLite triggers. The app polls `GET /sync/status` every three
   seconds while visible and on focus, reloads changed domains with
   `GET /state/{domain}` and refreshes the current page. The refresh waits
   while a dialog is open or a form field has focus.

### First start after upgrading

For each domain the app compares its cache with the database:

- Database not yet initialized and the device has data: the desktop app makes
  a database backup, then uploads the device copy (before this release the
  app never displayed database data). With a custom backend that already
  holds data, the app asks which copy to keep.
- Database not initialized and the device is empty: the database copy is used,
  so an agent can onboard someone before the app is first opened.
- Database initialized: the database copy wins. If this device holds
  different data it never synchronized with this database, the app asks which
  copy to keep instead of overwriting either.

## Authentication

- The desktop app starts its backend on a random loopback port with a random
  bearer token per launch. The renderer gets both through the preload bridge;
  agents get a separate, revocable token (see below).
- A standalone backend requires `Authorization: Bearer <API_TOKEN>` when the
  `API_TOKEN` environment variable is set. Set it whenever the backend is
  reachable beyond loopback. In the app, enter the token under
  **Settings > Backend** next to the custom URL.
- `GET /api/v1/health` stays public for health checks.

## Agent discovery (desktop)

**Settings > Agent access** is off by default. When on, the main process mints
a separate agent token (the embedded backend accepts it next to the app's own
token) and writes `agent-api.json` (mode `0600`) next to the database:

```json
{ "schemaVersion": 1, "app": "Fire Tools", "appVersion": "x.y.z",
  "apiBaseUrl": "http://127.0.0.1:53124/api/v1", "token": "<agent secret>",
  "pid": 12345, "startedAt": "...", "guideUrl": "...", "openapiUrl": "..." }
```

Turning access on (or starting the app with it on) issues a new agent token.
Turning it off or quitting revokes the token at once and removes the file. While
access is on, any process running as the same OS user can use the API, including
when the database is passphrase-encrypted; the settings copy says so.
Code: `electron/agentAccess.cjs`, IPC `fire-tools:agent-access-get|set`.

## Endpoints for agents

| Purpose | Route |
| --- | --- |
| Connection and change detection | `GET /sync/status` |
| Whole domain as the app sees it | `GET /state/{domain}` |
| Batch changes in one transaction | `PATCH /state/{domain}` |
| Replace a domain (destructive) | `PUT /state/{domain}` |
| Single records | the existing domain routes, e.g. `POST /expense-tracker/expenses` |

Changesets have `set` (singletons), `upsert` (collections of records keyed by
id) and `delete` (keys). Records use the app's own shapes plus `year`/`month`
for month-scoped records and `position` for list order. The full table of
collections and a worked onboarding example are in the agent skill's
[API reference](https://github.com/fire-tools-inc/app/blob/main/.github/skills/using-fire-tools/references/api.md).

Routes for questionnaire results, notifications, Monte Carlo runs and portfolio
metadata are stored in the database but not displayed by the app yet; their
OpenAPI descriptions say so.

## Agent skill

[`.github/skills/using-fire-tools`](https://github.com/fire-tools-inc/app/tree/main/.github/skills/using-fire-tools)
is an [Agent Skills](https://agentskills.io/specification) package for people
who want an agent to operate their Fire Tools data. The site publishes it at
`/agents/using-fire-tools/` and lists it in `/llms.txt`. Its helper script reads
the discovery file, adds the token and refuses absolute URLs so the token never
leaves the machine. Install steps for users: [Use Fire Tools with an AI
agent](../user/ai-agents.md).

## Try it with curl

```sh
file="$HOME/Library/Application Support/Fire Tools/agent-api.json"
base=$(node -p "require(process.argv[1]).apiBaseUrl" "$file")
auth="Authorization: Bearer $(node -p "require(process.argv[1]).token" "$file")"
curl -s -H "$auth" "$base/sync/status"
curl -s -H "$auth" "$base/state/netWorth"
```

Test against a copy of your profile, not your real data:
[Test a branch with a copy of your data](https://github.com/fire-tools-inc/app/blob/main/electron/README.md).
