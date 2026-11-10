import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetAllocationPage } from '../../../src/components/AssetAllocationPage';
import { createEmptyMonthlySnapshot } from '../../../src/types/netWorthTracker';
import { DEFAULT_ASSET_CLASS_TARGETS } from '../../../src/utils/dataSync';
import type { Asset } from '../../../src/types/assetAllocation';

const storage = vi.hoisted(() => ({
  loadAssetAllocation: vi.fn(),
  saveAssetAllocation: vi.fn(),
  loadNetWorthTrackerData: vi.fn(),
  saveNetWorthTrackerData: vi.fn(),
}));
vi.mock('../../../src/utils/cookieStorage', () => ({
  ...storage, clearAssetAllocation: vi.fn(),
}));
vi.mock('../../../src/contexts/AuditLogContext', () => ({
  useAuditLog: () => ({ logAuditEvent: vi.fn() }),
}));
vi.mock('../../../src/hooks/useDeferredRender', () => ({ useDeferredRender: () => false }));
vi.mock('../../../src/hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({ refresh: vi.fn(), isLoading: false, lastUpdate: null, error: null }),
}));
vi.mock('../../../src/hooks/useAssetPrices', () => ({
  useAssetPrices: () => ({ refreshPrices: vi.fn(), isLoading: false, lastRefresh: null, error: null }),
}));
vi.mock('../../../src/components/EditableAssetClassTable', () => ({ EditableAssetClassTable: () => null }));
vi.mock('../../../src/components/SharedAssetDialog', () => ({ SharedAssetDialog: () => null }));
vi.mock('../../../src/components/MassEditDialog', () => ({ MassEditDialog: () => null }));
vi.mock('../../../src/components/DCAHelperDialog', () => ({ DCAHelperDialog: () => null }));
vi.mock('../../../src/components/CollapsibleAllocationTable', () => ({
  CollapsibleAllocationTable: ({ assets, onUpdateAsset }: {
    assets: Asset[];
    onUpdateAsset: (id: string, updates: Partial<Asset>) => void;
  }) => <button onClick={() => onUpdateAsset(assets[0].id, { currentValue: assets[0].currentValue + 1 })}>Update test holding</button>,
}));

describe('Asset Allocation persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));
    vi.clearAllMocks();
    const asset: Asset = {
      id: 'test-holding', name: 'Test holding', ticker: '', assetClass: 'STOCKS',
      subAssetType: 'ETF', currentValue: 5000, targetMode: 'PERCENTAGE', targetPercent: 100,
    };
    storage.loadAssetAllocation.mockReturnValue({ assets: [asset], assetClassTargets: DEFAULT_ASSET_CLASS_TARGETS });
    storage.loadNetWorthTrackerData.mockReturnValue({
      currentYear: 2026, currentMonth: 3, defaultCurrency: 'EUR',
      years: [{ year: 2026, isArchived: false, months: [createEmptyMonthlySnapshot(2026, 3)] }],
      settings: { showPensionInNetWorth: true, includeUnrealizedGains: true, syncWithAssetAllocation: true },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('persists every rapid edit while Net Worth synchronization is enabled', () => {
    render(<MemoryRouter><AssetAllocationPage /></MemoryRouter>);
    act(() => fireEvent.click(screen.getByText('Update test holding')));
    act(() => fireEvent.click(screen.getByText('Update test holding')));
    expect(storage.saveAssetAllocation.mock.lastCall?.[0][0].currentValue).toBe(5002);
    expect(storage.saveNetWorthTrackerData.mock.lastCall?.[0].years[0].months[0].assets[0].pricePerShare).toBe(5002);
  });
});
