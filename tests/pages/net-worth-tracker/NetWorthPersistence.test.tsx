import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetWorthTrackerPage } from '../../../src/components/NetWorthTrackerPage';
import { createEmptyMonthlySnapshot } from '../../../src/types/netWorthTracker';
import { DEFAULT_ASSET_CLASS_TARGETS } from '../../../src/utils/dataSync';

const storage = vi.hoisted(() => ({
  loadNetWorthTrackerData: vi.fn(),
  saveNetWorthTrackerData: vi.fn(),
  loadAssetAllocation: vi.fn(),
  saveAssetAllocation: vi.fn(),
}));
vi.mock('../../../src/utils/cookieStorage', () => ({ ...storage, clearNetWorthTrackerData: vi.fn() }));
vi.mock('../../../src/contexts/AuditLogContext', () => ({
  useAuditLog: () => ({ logAuditEvent: vi.fn() }),
}));
vi.mock('../../../src/hooks/useDeferredRender', () => ({ useDeferredRender: () => false }));
vi.mock('../../../src/components/SharedAssetDialog', () => ({ SharedAssetDialog: () => null }));

describe('Net Worth persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));
    vi.clearAllMocks();
    storage.loadAssetAllocation.mockReturnValue({ assets: [], assetClassTargets: DEFAULT_ASSET_CLASS_TARGETS });
    storage.loadNetWorthTrackerData.mockReturnValue({
      currentYear: 2026, currentMonth: 3, defaultCurrency: 'EUR',
      years: [{ year: 2026, isArchived: false, months: [createEmptyMonthlySnapshot(2026, 3)] }],
      settings: { showPensionInNetWorth: true, includeUnrealizedGains: true, syncWithAssetAllocation: false },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('persists a second change immediately after synchronization', () => {
    render(<MemoryRouter><NetWorthTrackerPage /></MemoryRouter>);
    const toggle = screen.getByRole('checkbox', { name: /sync.*asset allocation/i });
    fireEvent.click(toggle);
    expect(storage.saveNetWorthTrackerData.mock.lastCall?.[0].settings.syncWithAssetAllocation).toBe(true);
    fireEvent.click(toggle);
    expect(storage.saveNetWorthTrackerData.mock.lastCall?.[0].settings.syncWithAssetAllocation).toBe(false);
  });
});
