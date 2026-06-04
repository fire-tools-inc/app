/**
 * Navbar labels — English ONLY. Do NOT localize.
 *
 * Per issue mbianchidev/fire-tools#233, the app navbar must always render in
 * English regardless of the user's selected UI language. These strings are the
 * single source of truth for the top-level navigation and any navbar-styled
 * links that appear elsewhere (e.g. on the 404 page).
 *
 * Rules for contributors:
 *  - NEVER pass these strings through `react-i18next` (`t(...)`) or any other
 *    translation pipeline.
 *  - NEVER add equivalent `nav.*` keys to `src/i18n/locales/*.json`.
 *  - If a new top-level navbar entry is added, add it here in English and
 *    consume the constant directly in JSX.
 *
 * A regression test in `tests/shared/navbarLabels.test.ts` enforces these
 * rules at build time.
 */
export const NAVBAR_LABELS = {
  ariaLabel: 'Main navigation',
  toggle: 'Toggle navigation menu',
  home: 'Home',
  assetAllocation: 'Asset Allocation',
  portfolioBreakdown: 'Portfolio Breakdown',
  cashflow: 'Cashflow',
  netWorth: 'Net Worth',
  fireCalculator: 'FIRE Calculator',
  monteCarlo: 'Monte Carlo',
  investmentGrowth: 'Investment Growth',
  withdrawalRate: 'Withdrawal Rate',
  tools: 'Tools',
} as const;

export type NavbarLabelKey = keyof typeof NAVBAR_LABELS;
