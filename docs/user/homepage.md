# Dashboard & navigation

Home opens your financial dashboard. The tool catalogue lives on the
[website](https://fire-tools-inc.github.io/app/#features); every tool remains
reachable from the sidebar.

![Homepage](./screenshots/homepage.png)

## What you see

- **Sidebar navigation** — labelled links to every tool stay on the left in
  desktop-sized windows, in a narrow rounded rail. The logo and portfolio
  identity are at the top; Settings and notifications sit below a divider at
  the bottom. The profile is not a duplicate Settings menu.
  Tracking and planning tools are grouped separately, with compact rows and a
  subtle highlight for the current page.
- **Net worth history** — your latest recorded snapshot and its change from the
  previous snapshot, with a chart of the last 12 snapshots or all history.
  Pensions follow the tracker's saved inclusion setting; debts, unpaid taxes
  and mortgage balances follow the existing net-worth calculation. Future and
  untouched empty snapshots are not presented as current balances. Recorded
  zero and negative balances remain visible.
- **Asset allocation** — the current active portfolio, using the same class
  colors as the other portfolio views. Excluded holdings are not included.
  The dashboard does not add this balance to net worth or duplicate assets
  across stores. Negative balances remain in the portfolio total; the donut
  uses only positive class balances and normalizes those shares to 100%.
- **Monthly cash flow** — this calendar month's income, expenses, balance and
  savings rate, plus the last six tracked months. A spending deficit stays
  negative. An old selected month is not mistaken for the current month.
- **FIRE progress** — the target and projection from your saved calculator
  inputs, including the selected FIRE variant. If the calculator uses Asset
  Allocation, its inclusion and primary-residence settings still apply.
  Otherwise progress uses the saved calculator balance, not total net worth.
  Percentages can exceed 100%; the visual progress bar stops at the target.
  Projections are not guarantees.
- **No invented data** — missing sections explain what to record and link to
  the relevant tool. Viewing Home does not seed or overwrite financial data.
  The public demo displays the app's existing sample data and stays read-only.
- **Upcoming commitments and savings goals** — compact summaries of the next
  three pending commitments within 30 days and three active manual goals link
  to Cashflow Planning. Reserved goal balances are not added to net worth,
  portfolio totals, FIRE progress or recorded cashflow.
- **Dark by default** — the interface stays dark even if your operating system
  uses a light theme. Text and financial values stay opaque; glass effects are
  confined to panels and navigation, with restrained green/teal accents.
- **Language and currency** are remembered across sessions and follow you to
  every tool.

## Tips

- Use `Tab` to reach dashboard actions and sidebar links. **View chart data**
  exposes the figures in a keyboard-scrollable table.
- **Hide values / Show values** follows and saves the same privacy preference
  used by the tools. It hides values visually, not from code or exports.
- Returning from another tool, focusing the app or receiving a storage update
  refreshes the dashboard's saved balances. Each tracker keeps its own currency
  label; the dashboard does not silently convert or relabel amounts.
- **Collapse sidebar** switches the desktop rail to icons and gives the page
  more room. Hover an icon for its label; **Expand sidebar** restores the full
  menu. The choice is remembered on this device.
- Below 1,000 pixels, **Menu** opens the sidebar as a drawer. Keyboard focus stays
  inside until you navigate, press `Escape` or dismiss it. Closing returns focus
  to the Menu button. The rest of the page is inactive while the drawer is open.
- **Skip to main content** works in both the browser and desktop app.
- Need to start fresh? Open [Settings](./settings.md) and use **Clear all
  data** — your local store is wiped (SQLite DB on desktop, encrypted cookies
  in browser) and the app reloads empty.
