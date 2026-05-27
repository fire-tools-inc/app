import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Stub cookie storage so we can control returned assets/settings
vi.mock('../../src/utils/cookieStorage', () => ({
  loadAssetAllocation: vi.fn(() => ({
    assets: [
      {
        id: '1',
        name: 'Vanguard Total Stock',
        ticker: 'VTI',
        assetClass: 'STOCKS',
        subAssetType: 'ETF',
        currentValue: 1000,
        targetMode: 'PERCENTAGE',
        targetPercent: 100,
        originalCurrency: 'USD',
      },
      {
        id: '2',
        name: 'Apartment',
        ticker: '',
        assetClass: 'REAL_ESTATE',
        subAssetType: 'PROPERTY',
        currentValue: 200000,
        targetMode: 'PERCENTAGE',
        targetPercent: 100,
        originalCurrency: 'EUR',
      },
    ],
    assetClassTargets: undefined,
  })),
}));

vi.mock('../../src/utils/cookieSettings', () => ({
  loadSettings: vi.fn(() => ({
    accountName: 'Tester',
    privacyMode: false,
    currencySettings: { defaultCurrency: 'EUR', fallbackRates: {}, useApiRates: false, lastApiUpdate: null },
    fireAssetClassInclusion: {},
    includePrimaryResidenceInFIRE: true,
  })),
  saveSettings: vi.fn(),
}));

// Mock the metadata fetch so no network is touched
vi.mock('../../src/utils/yahooMetadata', () => ({
  fetchAssetMetadataBatch: vi.fn(async (tickers: string[]) => {
    const out: Record<string, unknown> = {};
    for (const t of tickers) {
      out[t.toUpperCase()] = {
        ticker: t.toUpperCase(),
        sector: 'Technology',
        country: 'United States',
        exchange: 'NMS',
        fundFamily: 'Vanguard',
        quoteType: 'ETF',
        fetchedAt: new Date().toISOString(),
      };
    }
    return out;
  }),
  clearAssetMetadataCache: vi.fn(),
}));

import { PortfolioBreakdownPage } from '../../src/components/PortfolioBreakdownPage';

describe('PortfolioBreakdownPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page header and portfolio value', async () => {
    render(
      <MemoryRouter>
        <PortfolioBreakdownPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Portfolio Breakdown/i })).toBeTruthy();
    // Sum of mocked assets = 201_000
    await waitFor(() => {
      expect(screen.getByText(/Portfolio Value/i)).toBeTruthy();
    });
  });

  it('renders breakdown charts (titles) for every dimension', async () => {
    render(
      <MemoryRouter>
        <PortfolioBreakdownPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /By Currency/i })).toBeTruthy();
    });

    expect(screen.getByRole('heading', { name: /By Holding/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /By Sector/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /By Continent/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /By Region/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /By Market/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /By ETF Provider/i })).toBeTruthy();
  });

  it('fetches metadata for tickers that exist on initial render (no async-load race)', async () => {
    const { fetchAssetMetadataBatch } = await import('../../src/utils/yahooMetadata');
    render(
      <MemoryRouter>
        <PortfolioBreakdownPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchAssetMetadataBatch).toHaveBeenCalled();
    });
    // The first (and only) call must include the ticker that was already in
    // the saved allocation. If the page loads assets asynchronously, the
    // first call would happen with an empty array and metadata would never
    // populate.
    const firstCall = (fetchAssetMetadataBatch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    expect(firstCall[0]).toContain('VTI');
  });

  it('shows a back link to Asset Allocation', () => {
    render(
      <MemoryRouter>
        <PortfolioBreakdownPage />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: /Asset Allocation/i });
    expect(links.length).toBeGreaterThan(0);
  });
});
