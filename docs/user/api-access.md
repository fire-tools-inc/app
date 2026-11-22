# Use the Fire Tools API

The Fire Tools desktop app serves a local REST API. Anything on your computer
can use it: your own scripts, a spreadsheet, another app, or an AI agent such
as GitHub Copilot CLI or Claude Code. Whatever a client writes shows up in the
open app within a few seconds, and everything you change in the app is
available to clients straight away.

Nothing is uploaded by Fire Tools. If you connect an AI agent, it sends what it
reads and what you tell it to its own model provider, so share only what you
are comfortable sharing.

## Turn on API access

1. Open the Fire Tools desktop app.
2. Go to **Settings > API access** and turn on **Allow local API access**.

The section then shows everything a client needs:

- **Address**: `http://127.0.0.1:47820/api/v1` by default. It stays the same
  across restarts. Change the **Port** if another program already uses it.
- **Access token**: send it with every request as
  `Authorization: Bearer <token>`. **Copy token** puts it on the clipboard.
  It stays valid across restarts until you **Regenerate token** or turn access
  off; turning access on again issues a new one.
- **Connection file**: the same address and token in a JSON file only your
  user account can read, for scripts that should not store the token. It is
  deleted when you turn access off or quit.

Only programs on this computer can connect. While access is on, any program
running under your user account that has the token can read and change your
data, even in an encrypted database. Turn access off when you no longer need it.

## Call it from a script

```sh
export FIRE_TOOLS_TOKEN='<paste the copied token>'
curl -H "Authorization: Bearer $FIRE_TOOLS_TOKEN" \
  http://127.0.0.1:47820/api/v1/state/netWorth
```

Add an expense to March 2026:

```sh
curl -X POST http://127.0.0.1:47820/api/v1/expense-tracker/expenses \
  -H "Authorization: Bearer $FIRE_TOOLS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"externalId":"script-2026-03-07-cinema","date":"2026-03-07","amount":14,
       "description":"Cinema","category":"LIFESTYLE_LEISURE","expenseType":"WANT"}'
```

Reading the connection file instead (Python, macOS path):

```python
import json, pathlib, urllib.request

conn = json.loads((pathlib.Path.home() / "Library/Application Support/Fire Tools/local-api.json").read_text())
req = urllib.request.Request(f"{conn['apiBaseUrl']}/sync/status",
                             headers={"Authorization": f"Bearer {conn['token']}"})
print(json.load(urllib.request.urlopen(req)))
```

The connection file lives in `%APPDATA%\Fire Tools\` on Windows and
`~/.config/Fire Tools/` on Linux. Every route, request and response is in the
[API reference](https://fire-tools-inc.github.io/app/api/); the
[engineering guide](../engineering/local-api.md) explains how changes sync.

## Connect an AI agent

The `using-fire-tools` skill teaches an agent to use the API safely: check the
connection, ask before writing, never reveal the token, and use the right
categories. For GitHub Copilot CLI and other agents that read
`~/.agents/skills` (use `~/.claude/skills` for Claude Code):

```sh
dir="$HOME/.agents/skills/using-fire-tools"
base="https://fire-tools-inc.github.io/app/agents/using-fire-tools"
mkdir -p "$dir/scripts" "$dir/references"
for f in SKILL.md scripts/fire-tools-api.mjs references/api.md references/data-model.md; do
  curl -fsSL "$base/$f" -o "$dir/$f"
done
```

The helper script needs Node.js 18 or newer and reads the connection file, so
the agent never sees the token. The skill source lives in the repository under
[`.github/skills/using-fire-tools`](https://github.com/fire-tools-inc/app/tree/main/.github/skills/using-fire-tools).

Then ask, for example:

- "Set me up in Fire Tools. I'm 34, I spend about 2,800 a month and want to
  retire at 52."
- "Here are my March expenses, log them in Fire Tools." followed by a pasted list.
- "Log last month: salary, expenses from this export, and my updated pension value."
- "How did my savings rate change over the last six months?"

The agent shows a summary before it writes anything. Check the Dashboard
afterwards; you can edit or delete anything it added like any other entry.

## Good to know

- Clients reach the API only while the app is running with API access on.
- Preferences, the FIRE calculator, Asset Allocation, Cashflow and Net Worth
  are all available. AI model settings and their API keys are not.
- Changes from a client refresh the page you are on. If you are typing in a
  form or a dialog is open, the refresh waits until you finish.
- A self-hosted backend works the same way: use its address and the
  `API_TOKEN` you configured (see the [engineering guide](../engineering/local-api.md)).
- Prefer files over API access? The [spreadsheet import prompts](./spreadsheet-import.md)
  produce workbooks you review and import yourself.
