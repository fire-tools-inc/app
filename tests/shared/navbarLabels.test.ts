/**
 * Regression tests for issue mbianchidev/fire-tools#233.
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
import { readdirSync, readFileSync, statSync } from 'node:fs';
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

const collectSourceFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectSourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
};

const T_NAV_REGEX = /\bt\(\s*['"`]nav\./;

describe('navbar is English-only (#233)', () => {
  it('exposes the expected English labels via NAVBAR_LABELS', () => {
    expect(NAVBAR_LABELS).toEqual({
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
    });
  });

  it('no source file routes navbar strings through i18n (t("nav.…"))', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_DIR)) {
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
