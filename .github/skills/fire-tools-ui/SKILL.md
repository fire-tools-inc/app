---
name: fire-tools-ui
description: >-
  Maintain Fire Tools' dark glass interface, sidebar, responsive pages and
  portfolio charts. Use for navigation changes, CSS/theme work, chart colors,
  layout regressions, accessibility fixes or screenshot-driven UI refinement
  in this repository.
---

# Fire Tools interface work

Read `AGENTS.md` at the repository root. Paths below are repository-relative.
Preserve the current app identity and behavior; a new visual reference is not
permission to invent accounts, change storage or drop tools.

## Inspect the relevant surfaces

| Surface | Source |
| --- | --- |
| Sidebar, profile header, desktop/mobile behavior | `src/components/AppNavigation.tsx`, `src/components/AppNavigation.css` |
| Shell, routes, drawer inactivity and title bar | `src/App.tsx`, `src/App.css`, `index.html` |
| English-only navigation labels | `src/constants/navbarLabels.ts` |
| Portfolio palette | `src/utils/chartColors.ts` |
| Compact donut and readable legend | `src/components/AllocationChart.tsx`, `src/components/AllocationChart.css` |
| Shared legends and stable cashflow colors | `src/components/ChartLegend.tsx`, `src/utils/expenseChartColors.ts` |
| Static portfolio identity and saved sidebar mode | `src/components/ProfileBadge.tsx`, `src/utils/navigationPreferences.ts` |
| Allocation tables and legacy CSS overrides | `src/components/AssetAllocationManager.css`, `src/components/CollapsibleAllocationTable.tsx` |
| Other UI language resources | `src/i18n/locales/` |

Read all matching selectors and media queries before editing. A correct rule
near the top of a large CSS file can still be overridden later or by another
route's stylesheet.

## Implement within the design system

- Keep dark mode as the default, including on light-theme operating systems.
- Preserve the inset rounded rail, centered profile, compact labelled menu and
  bottom utility divider. Keep destinations visible at normal desktop heights.
- Restore/reuse the canonical `public/fire-icon.svg` logo with build-relative
  paths. Keep the teal palette and the static profile identity; Settings belongs
  in the sidebar rather than a duplicate profile dropdown.
- Preserve icon-only desktop collapse/expansion, saved preference and accessible
  names/tooltips. Mobile ignores the desktop collapsed state and shows full
  labels. Reflow charts when the workspace changes width.
- Preserve the mobile breakpoint and focus-contained drawer. Keep the main
  workspace inactive while open, close on navigation/Escape/backdrop, restore
  focus, and retain 44-pixel touch targets. Desktop pointer rows may be denser.
- Keep Electron drag regions separate from interactive controls and preserve
  hash routes. In-app links should use `PreloadLink`.
- Use shared color tokens and `chartColors.ts`; keep portfolio class identities
  consistent across charts. Text and legends should remain opaque and readable.
- Use responsive pie radii and `ChartLegend` outside plots with many entries.
  Keep income sources stacked beside expenses with negative yields below zero.
  Share cashflow colors through `expenseChartColors.ts` and retain user overrides.
- Scope chart/table CSS to its page. Dense histograms/Sankey diagrams should
  scroll locally with keyboard support instead of clipping data or shrinking
  labels. Test SVG/text bounds and minimum usable plot height.
- Use glass for surfaces, not neon section gradients or excessive blur. Avoid
  animating width/padding/margins, and respect reduced motion.
- Give page content `min-width: 0` and responsive layouts relative to its
  workspace, not the whole viewport. Scrolling tables must not widen the page.
- Keep `index.html` critical shell styles synchronized with the full CSS.
- Reuse local icons/system fonts; do not reintroduce external UI font downloads.
- Keep labels semantic, errors actionable and other new copy translated in all
  five locales. Navigation labels stay in the English-only constants.

## Verify the requirement, not a proxy

Use the existing tests relevant to the change:

```sh
npm test -- tests/shared/AppNavigation.test.tsx tests/shared/AppStartup.test.tsx tests/shared/navbarLabels.test.ts
npm test -- tests/shared/chartColors.test.ts tests/pages/asset-allocation/AllocationChart.test.tsx
npm run build
npx vite build --mode electron
npm run test:browser
```

Open an isolated preview and use headless Playwright. Avoid the dev lifecycle's
stop script when it could interrupt unrelated work. Use mock/demo data and block
unnecessary external requests.

Check actual DOM/computed styles and screenshots at 1440, 1280, 1024, 768, 390
and 320 pixels, with short windows too. Navigate between routes so dynamically
loaded styles can expose cascade regressions. Check:

- Rail placement, header/profile hierarchy and available page area.
- Drawer keyboard containment, Escape focus return and inactive page content.
- Static profile identity and notification popup placement in both rail modes.
- Dense currency/category legends, histogram counts, Sankey labels and end-axis
  ticks; ensure charts stay healthy after navigation and collapse/expansion.
- Normal, hovered and selected states; legible text and chart legends.
- No document-wide overflow and no hidden or unreachable route controls.
- `file://` navigation and skip links in an isolated hidden Electron window
  when shell/routing behavior changed.

Refresh affected screenshots with `npm run docs:screenshots` and update
`docs/user/homepage.md` or the relevant tool guide. Do not claim screen-reader
testing when only a screenshot or DOM check was performed.

Future test prompts are in `evals/evals.json`; they describe scenarios, not
completed model evaluations.
