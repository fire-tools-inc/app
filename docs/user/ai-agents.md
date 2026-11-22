# Use Fire Tools with an AI agent

An AI agent such as GitHub Copilot CLI or Claude Code can set up Fire Tools
for you from a conversation: it asks about your plan, accounts, investments,
income and spending, then writes them into the app. It can also log a month
for you or categorize a pasted list of expenses. Everything it writes shows up
in the open app within a few seconds.

The agent talks to the Fire Tools desktop app on your computer through a local
API. Nothing is uploaded by Fire Tools, but the agent sends what it reads and
what you tell it to its own model provider, so share only what you are
comfortable sharing.

## 1. Turn on agent access

1. Open the Fire Tools desktop app.
2. Go to **Settings > Agent access** and turn on **Allow local AI agents**.

Fire Tools then writes a small connection file that only your user account can
read. It holds the local address and a secret token that changes every time the
app starts. The file is deleted when you quit the app or turn access off.

Turn agent access off when you are done. While it is on, any program running
under your account can read and change your Fire Tools data, including data in
an encrypted database.

## 2. Install the Fire Tools skill

The skill teaches the agent how to use the API safely: check the connection,
ask before writing, never reveal the token, and use the right categories.

For GitHub Copilot CLI and other agents that read `~/.agents/skills`
(use `~/.claude/skills` for Claude Code):

```sh
dir="$HOME/.agents/skills/using-fire-tools"
base="https://fire-tools-inc.github.io/app/agents/using-fire-tools"
mkdir -p "$dir/scripts" "$dir/references"
for f in SKILL.md scripts/fire-tools-api.mjs references/api.md references/data-model.md; do
  curl -fsSL "$base/$f" -o "$dir/$f"
done
```

The helper script needs Node.js 18 or newer. The skill source lives in the
repository under
[`.github/skills/using-fire-tools`](https://github.com/fire-tools-inc/app/tree/main/.github/skills/using-fire-tools).

## 3. Ask the agent

Examples:

- "Set me up in Fire Tools. I'm 34, I spend about 2,800 a month and want to
  retire at 52."
- "Here are my March expenses, log them in Fire Tools." followed by a pasted list.
- "Log last month: salary, expenses from this export, and my updated pension value."
- "How did my savings rate change over the last six months?"

The agent shows a summary before it writes anything. Check the Dashboard
afterwards; you can edit or delete anything it added like any other entry.

## Good to know

- The agent can only reach the app while it is running with agent access on.
- Preferences, the FIRE calculator, Asset Allocation, Cashflow and Net Worth
  are all available to agents. AI model settings and API keys are not.
- Changes from an agent refresh the page you are on. If you are typing in a
  form or a dialog is open, the refresh waits until you finish.
- Self-hosted backends work too: point the agent at your backend URL and the
  `API_TOKEN` you configured (see the
  [engineering guide](../engineering/agent-api.md)).
- Prefer not to connect an agent at all? The
  [spreadsheet import prompts](./spreadsheet-import.md) produce files you review
  and import yourself.
