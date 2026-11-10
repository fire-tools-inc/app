/**
 * Regression tests for issue fire-tools-inc/app#233.
 *
 * The app navbar must always render in English, regardless of the user's
 * selected UI language. This is enforced by:
 *  1. Centralising the labels in `src/constants/navbarLabels.ts`.
 *  2. Forbidding any `t('nav.…')` (i18n) lookups in source.
 *  3. Forbidding any `nav.*` keys in the locale JSON files.
 *
 * If this file fails, do NOT "fix" it by re-introducing translations — the
 * navbar is intentionally non-localisable. Update the constants instead.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAVBAR_LABELS } from '../../src/constants/navbarLabels';
import en from '../../src/i18n/locales/en.json';
import itLocale from '../../src/i18n/locales/it.json';
import fr from '../../src/i18n/locales/fr.json';
import de from '../../src/i18n/locales/de.json';
import es from '../../src/i18n/locales/es.json';

const SELF_FILE = fileURLToPath(import.meta.url);
const SRC_DIR = resolve(dirname(SELF_FILE), '../../src');

const collectSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map(entry => join(entry.parentPath, entry.name));

const T_NAV_REGEX = /\bt\(\s*['"`]nav\./;

describe('navbar is English-only (#233)', () => {
  it('exposes the expected English labels via NAVBAR_LABELS', () => {
    expect(NAVBAR_LABELS).toEqual({
      ariaLabel: 'Main navigation',
      toggle: 'Toggle navigation menu',
      home: 'Home',
      assetAllocation: 'Asset Allocation',
      portfolioBreakdown: 'Portfolio Breakdown',
      portfolioBacktest: 'Portfolio Backtest',
      cashflow: 'Cashflow',
      netWorth: 'Net Worth',
      fireCalculator: 'FIRE Calculator',
      monteCarlo: 'Monte Carlo',
      debtPayoff: 'Debt Payoff',
      investmentGrowth: 'Investment Growth',
      withdrawalRate: 'Withdrawal Rate',
      tools: 'Tools',
      tracking: 'Tracking',
      planning: 'Planning',
      reverseFireCalculator: 'Reverse FIRE',
      questionnaire: 'Questionnaire',
      settings: 'Settings',
      menu: 'Menu',
      close: 'Close navigation',
      collapse: 'Collapse sidebar',
      expand: 'Expand sidebar',
    });
  });

  // Static source scan; the limit only guards against a hung worker on a loaded host.
  it('no source file routes navbar strings through i18n (t("nav.…"))', { timeout: 30000 }, () => {
    const offenders: string[] = [];
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      if (file === SELF_FILE) continue;
      const content = readFileSync(file, 'utf-8');
      if (T_NAV_REGEX.test(content)) offenders.push(file);
    }
    expect(
      offenders,
      `Files routing navbar labels through t('nav.…') — use NAVBAR_LABELS instead:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('no locale file defines a top-level `nav` block', () => {
    const locales: Record<string, Record<string, unknown>> = {
      en: en as Record<string, unknown>,
      it: itLocale as Record<string, unknown>,
      fr: fr as Record<string, unknown>,
      de: de as Record<string, unknown>,
      es: es as Record<string, unknown>,
    };
    for (const [name, data] of Object.entries(locales)) {
      expect(
        Object.prototype.hasOwnProperty.call(data, 'nav'),
        `Locale "${name}" must not define a "nav" block — navbar labels live in src/constants/navbarLabels.ts`,
      ).toBe(false);
    }
  });
});
