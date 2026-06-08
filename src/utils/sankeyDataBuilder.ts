/**
 * Utility for building recharts Sankey data from a MonthlySnapshot.
 * Visualises: Total Portfolio → [Investments, Cash, Pension] → sub-categories.
 */

import { MonthlySnapshot, ASSET_CLASSES, ACCOUNT_TYPES, PENSION_TYPES } from '../types/netWorthTracker';

export interface SankeyNodeEntry {
  name: string;
  fill: string;
}

export interface SankeyLinkEntry {
  source: number;
  target: number;
  value: number;
}

export interface SankeyGraphData {
  nodes: SankeyNodeEntry[];
  links: SankeyLinkEntry[];
}

export const ASSET_CLASS_COLORS: Record<string, string> = {
  STOCKS: '#22C55E',
  ETF: '#4ADE80',
  BONDS: '#F59E0B',
  CRYPTO: '#A78BFA',
  REAL_ESTATE: '#F97316',
  PRIVATE_EQUITY: '#06B6D4',
  VEHICLE: '#64748B',
  COLLECTIBLE: '#E879F9',
  ART: '#FB923C',
  COMMODITIES: '#FBBF24',
  OTHER: '#94A3B8',
};

export const CASH_TYPE_COLORS: Record<string, string> = {
  SAVINGS: '#22D3EE',
  CHECKING: '#0EA5E9',
  BROKERAGE: '#3B82F6',
  CREDIT_CARD: '#EF4444',
  OTHER: '#94A3B8',
};

export const PENSION_TYPE_COLORS: Record<string, string> = {
  STATE: '#C084FC',
  PRIVATE: '#A78BFA',
  EMPLOYER: '#818CF8',
  OTHER: '#94A3B8',
};

export const ASSET_CLASS_I18N_KEYS: Record<string, string> = {
  STOCKS: 'netWorth.sankey.assetClasses.stocks',
  ETF: 'netWorth.sankey.assetClasses.etf',
  BONDS: 'netWorth.sankey.assetClasses.bonds',
  CRYPTO: 'netWorth.sankey.assetClasses.crypto',
  REAL_ESTATE: 'netWorth.sankey.assetClasses.realEstate',
  PRIVATE_EQUITY: 'netWorth.sankey.assetClasses.privateEquity',
  VEHICLE: 'netWorth.sankey.assetClasses.vehicle',
  COLLECTIBLE: 'netWorth.sankey.assetClasses.collectible',
  ART: 'netWorth.sankey.assetClasses.art',
  COMMODITIES: 'netWorth.sankey.assetClasses.commodities',
  OTHER: 'netWorth.sankey.assetClasses.other',
};

export const ACCOUNT_TYPE_I18N_KEYS: Record<string, string> = {
  SAVINGS: 'netWorth.sankey.accountTypes.savings',
  CHECKING: 'netWorth.sankey.accountTypes.checking',
  BROKERAGE: 'netWorth.sankey.accountTypes.brokerage',
  CREDIT_CARD: 'netWorth.sankey.accountTypes.creditCard',
  OTHER: 'netWorth.sankey.accountTypes.other',
};

export const PENSION_TYPE_I18N_KEYS: Record<string, string> = {
  STATE: 'netWorth.sankey.pensionTypes.state',
  PRIVATE: 'netWorth.sankey.pensionTypes.private',
  EMPLOYER: 'netWorth.sankey.pensionTypes.employer',
  OTHER: 'netWorth.sankey.pensionTypes.other',
};

/** Minimum total portfolio value required to render the chart. */
export const MIN_CHART_VALUE = 1;

/**
 * Build Sankey graph data (nodes + links) from a MonthlySnapshot.
 *
 * Returns empty arrays when there is insufficient data to draw a useful chart.
 *
 * @param snapshot  - The monthly snapshot to visualise.
 * @param showPension - Whether to include pension data.
 * @param t - i18n translation function (key → string).
 */
export function buildSankeyData(
  snapshot: MonthlySnapshot,
  showPension: boolean,
  t: (key: string) => string
): SankeyGraphData {
  const nodes: SankeyNodeEntry[] = [];
  const links: SankeyLinkEntry[] = [];

  function addNode(name: string, fill: string): number {
    nodes.push({ name, fill });
    return nodes.length - 1;
  }

  // Aggregate investments by asset class (positive values only)
  const investmentsByClass = new Map<string, number>();
  for (const asset of snapshot.assets) {
    const value = asset.shares * asset.pricePerShare;
    if (value > 0) {
      investmentsByClass.set(asset.assetClass, (investmentsByClass.get(asset.assetClass) ?? 0) + value);
    }
  }

  // Aggregate cash by account type (positive balances only)
  const cashByType = new Map<string, number>();
  for (const entry of snapshot.cashEntries) {
    if (entry.balance > 0) {
      cashByType.set(entry.accountType, (cashByType.get(entry.accountType) ?? 0) + entry.balance);
    }
  }

  // Aggregate pensions by type (positive values only)
  const pensionByType = new Map<string, number>();
  if (showPension) {
    for (const pension of snapshot.pensions) {
      if (pension.currentValue > 0) {
        pensionByType.set(pension.pensionType, (pensionByType.get(pension.pensionType) ?? 0) + pension.currentValue);
      }
    }
  }

  const totalInvestments = [...investmentsByClass.values()].reduce((a, b) => a + b, 0);
  const totalCash = [...cashByType.values()].reduce((a, b) => a + b, 0);
  const totalPension = [...pensionByType.values()].reduce((a, b) => a + b, 0);
  const totalPortfolio = totalInvestments + totalCash + totalPension;

  if (totalPortfolio < MIN_CHART_VALUE) return { nodes: [], links: [] };

  const portfolioIdx = addNode(t('netWorth.sankey.totalPortfolio'), '#2DD4BF');

  if (totalInvestments > 0) {
    const investmentsIdx = addNode(t('netWorth.sankey.investments'), '#3B82F6');
    links.push({ source: portfolioIdx, target: investmentsIdx, value: totalInvestments });

    for (const [assetClass, value] of investmentsByClass.entries()) {
      if (value <= 0) continue;
      const i18nKey = ASSET_CLASS_I18N_KEYS[assetClass];
      const fallbackName = ASSET_CLASSES.find(c => c.id === assetClass)?.name ?? assetClass;
      const classIdx = addNode(
        i18nKey ? t(i18nKey) : fallbackName,
        ASSET_CLASS_COLORS[assetClass] ?? '#94A3B8'
      );
      links.push({ source: investmentsIdx, target: classIdx, value });
    }
  }

  if (totalCash > 0) {
    const cashIdx = addNode(t('netWorth.sankey.cashLiquidity'), '#06B6D4');
    links.push({ source: portfolioIdx, target: cashIdx, value: totalCash });

    for (const [accountType, balance] of cashByType.entries()) {
      if (balance <= 0) continue;
      const i18nKey = ACCOUNT_TYPE_I18N_KEYS[accountType];
      const fallbackName = ACCOUNT_TYPES.find(c => c.id === accountType)?.name ?? accountType;
      const typeIdx = addNode(
        i18nKey ? t(i18nKey) : fallbackName,
        CASH_TYPE_COLORS[accountType] ?? '#94A3B8'
      );
      links.push({ source: cashIdx, target: typeIdx, value: balance });
    }
  }

  if (totalPension > 0 && showPension) {
    const pensionIdx = addNode(t('netWorth.sankey.pension'), '#A855F7');
    links.push({ source: portfolioIdx, target: pensionIdx, value: totalPension });

    for (const [pensionType, value] of pensionByType.entries()) {
      if (value <= 0) continue;
      const i18nKey = PENSION_TYPE_I18N_KEYS[pensionType];
      const fallbackName = PENSION_TYPES.find(c => c.id === pensionType)?.name ?? pensionType;
      const typeIdx = addNode(
        i18nKey ? t(i18nKey) : fallbackName,
        PENSION_TYPE_COLORS[pensionType] ?? '#94A3B8'
      );
      links.push({ source: pensionIdx, target: typeIdx, value });
    }
  }

  return { nodes, links };
}
