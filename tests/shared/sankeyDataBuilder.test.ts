import { describe, it, expect } from 'vitest';
import { buildSankeyData, MIN_CHART_VALUE } from '../../src/utils/sankeyDataBuilder';
import { createEmptyMonthlySnapshot } from '../../src/types/netWorthTracker';

// Simple identity translation function for tests
const t = (key: string) => key;

function makeSnapshot() {
  return createEmptyMonthlySnapshot(2024, 1);
}

describe('buildSankeyData', () => {
  it('returns empty data when snapshot has no entries', () => {
    const result = buildSankeyData(makeSnapshot(), true, t);
    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
  });

  it('returns empty data when all values are zero', () => {
    const snapshot = {
      ...makeSnapshot(),
      assets: [{ id: '1', ticker: 'X', name: 'X', shares: 0, pricePerShare: 100, currency: 'EUR' as const, assetClass: 'STOCKS' as const }],
    };
    const result = buildSankeyData(snapshot, true, t);
    expect(result.nodes).toHaveLength(0);
  });

  it('returns empty data when total portfolio is below MIN_CHART_VALUE', () => {
    const snapshot = {
      ...makeSnapshot(),
      cashEntries: [{ id: '1', accountName: 'Test', accountType: 'SAVINGS' as const, balance: MIN_CHART_VALUE - 0.5, currency: 'EUR' as const }],
    };
    const result = buildSankeyData(snapshot, true, t);
    expect(result.nodes).toHaveLength(0);
  });

  it('builds nodes and links from assets only', () => {
    const snapshot = {
      ...makeSnapshot(),
      assets: [
        { id: '1', ticker: 'AAPL', name: 'Apple', shares: 10, pricePerShare: 100, currency: 'EUR' as const, assetClass: 'STOCKS' as const },
        { id: '2', ticker: 'VWCE', name: 'Vanguard ETF', shares: 5, pricePerShare: 200, currency: 'EUR' as const, assetClass: 'ETF' as const },
      ],
    };
    const result = buildSankeyData(snapshot, false, t);
    // Expected nodes: Total Portfolio, Investments, STOCKS, ETF = 4
    expect(result.nodes.length).toBe(4);
    // Expected links: portfolio→investments, investments→stocks, investments→etf = 3
    expect(result.links.length).toBe(3);
  });

  it('aggregates multiple assets of the same class into one node', () => {
    const snapshot = {
      ...makeSnapshot(),
      assets: [
        { id: '1', ticker: 'AAPL', name: 'Apple', shares: 10, pricePerShare: 100, currency: 'EUR' as const, assetClass: 'STOCKS' as const },
        { id: '2', ticker: 'MSFT', name: 'Microsoft', shares: 5, pricePerShare: 200, currency: 'EUR' as const, assetClass: 'STOCKS' as const },
      ],
    };
    const result = buildSankeyData(snapshot, false, t);
    // Total Portfolio + Investments + one STOCKS node = 3
    expect(result.nodes.length).toBe(3);
    // portfolio→investments + investments→stocks = 2
    expect(result.links.length).toBe(2);
    const stocksLink = result.links.find(l => l.source === 1);
    expect(stocksLink?.value).toBe(2000); // 10*100 + 5*200
  });

  it('includes cash entries and pensions when present', () => {
    const snapshot = {
      ...makeSnapshot(),
      assets: [
        { id: '1', ticker: 'AAPL', name: 'Apple', shares: 1, pricePerShare: 100, currency: 'EUR' as const, assetClass: 'STOCKS' as const },
      ],
      cashEntries: [
        { id: '2', accountName: 'Savings', accountType: 'SAVINGS' as const, balance: 500, currency: 'EUR' as const },
      ],
      pensions: [
        { id: '3', name: 'State', currentValue: 200, currency: 'EUR' as const, pensionType: 'STATE' as const },
      ],
    };
    const result = buildSankeyData(snapshot, true, t);
    // Portfolio, Investments, STOCKS, Cash, SAVINGS, Pension, STATE = 7 nodes
    expect(result.nodes.length).toBe(7);
    expect(result.links.length).toBe(6);
  });

  it('assigns graph levels: 0 root, 1 category, 2 leaf', () => {
    const snapshot = {
      ...makeSnapshot(),
      assets: [
        { id: '1', ticker: 'AAPL', name: 'Apple', shares: 1, pricePerShare: 100, currency: 'EUR' as const, assetClass: 'STOCKS' as const },
      ],
      cashEntries: [
        { id: '2', accountName: 'Savings', accountType: 'SAVINGS' as const, balance: 500, currency: 'EUR' as const },
      ],
      pensions: [
        { id: '3', name: 'Employer', currentValue: 200, currency: 'EUR' as const, pensionType: 'EMPLOYER' as const },
      ],
    };
    const result = buildSankeyData(snapshot, true, t);
    // Root portfolio node
    expect(result.nodes[0].level).toBe(0);
    // Category nodes (Investments, Cash, Pension)
    const categoryNames = [
      'netWorth.sankey.investments',
      'netWorth.sankey.cashLiquidity',
      'netWorth.sankey.pension',
    ];
    for (const node of result.nodes) {
      if (categoryNames.includes(node.name)) {
        expect(node.level).toBe(1);
      }
    }
    // Exactly one root, three categories, rest leaves
    expect(result.nodes.filter(n => n.level === 0)).toHaveLength(1);
    expect(result.nodes.filter(n => n.level === 1)).toHaveLength(3);
    expect(result.nodes.filter(n => n.level === 2)).toHaveLength(3);
  });

  it('excludes pension nodes when showPension is false', () => {
    const snapshot = {
      ...makeSnapshot(),
      assets: [
        { id: '1', ticker: 'AAPL', name: 'Apple', shares: 1, pricePerShare: 100, currency: 'EUR' as const, assetClass: 'STOCKS' as const },
      ],
      pensions: [
        { id: '3', name: 'State', currentValue: 200, currency: 'EUR' as const, pensionType: 'STATE' as const },
      ],
    };
    const result = buildSankeyData(snapshot, false, t);
    // Portfolio, Investments, STOCKS = 3 (no pension nodes)
    expect(result.nodes.length).toBe(3);
    expect(result.nodes.some(n => n.name.includes('pension') || n.name.includes('STATE'))).toBe(false);
  });

  it('skips cash entries with non-positive balances', () => {
    const snapshot = {
      ...makeSnapshot(),
      assets: [
        { id: '1', ticker: 'X', name: 'X', shares: 1, pricePerShare: 100, currency: 'EUR' as const, assetClass: 'STOCKS' as const },
      ],
      cashEntries: [
        { id: '2', accountName: 'Debt', accountType: 'CREDIT_CARD' as const, balance: -100, currency: 'EUR' as const },
        { id: '3', accountName: 'Savings', accountType: 'SAVINGS' as const, balance: 500, currency: 'EUR' as const },
      ],
    };
    const result = buildSankeyData(snapshot, false, t);
    // CREDIT_CARD (negative) should be excluded; SAVINGS included
    const nodeNames = result.nodes.map(n => n.name);
    expect(nodeNames).not.toContain('netWorth.sankey.accountTypes.creditCard');
    expect(nodeNames).toContain('netWorth.sankey.accountTypes.savings');
  });

  it('all link source/target indices are valid node indices', () => {
    const snapshot = {
      ...makeSnapshot(),
      assets: [
        { id: '1', ticker: 'AAPL', name: 'Apple', shares: 5, pricePerShare: 200, currency: 'EUR' as const, assetClass: 'ETF' as const },
      ],
      cashEntries: [
        { id: '2', accountName: 'Bank', accountType: 'CHECKING' as const, balance: 1000, currency: 'EUR' as const },
      ],
    };
    const result = buildSankeyData(snapshot, false, t);
    const maxIdx = result.nodes.length - 1;
    for (const link of result.links) {
      expect(link.source).toBeGreaterThanOrEqual(0);
      expect(link.source).toBeLessThanOrEqual(maxIdx);
      expect(link.target).toBeGreaterThanOrEqual(0);
      expect(link.target).toBeLessThanOrEqual(maxIdx);
      expect(link.value).toBeGreaterThan(0);
    }
  });
});
