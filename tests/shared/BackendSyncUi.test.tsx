import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendSyncStatus, RemoteChangeEvent } from '../../src/utils/backendSync';

const sync = vi.hoisted(() => ({
  status: null as unknown as BackendSyncStatus,
  remoteListener: null as ((event: RemoteChangeEvent) => void) | null,
  acknowledgeViewRefresh: vi.fn(),
  resolveSyncConflicts: vi.fn(async () => {}),
  dismissRejectedChanges: vi.fn(),
  retrySync: vi.fn(async () => {}),
}));

vi.mock('../../src/utils/backendSync', () => ({
  getSyncStatus: () => sync.status,
  subscribeSyncStatus: () => () => {},
  subscribeRemoteChanges: (listener: (event: RemoteChangeEvent) => void) => {
    sync.remoteListener = listener;
    return () => { sync.remoteListener = null; };
  },
  getRemoteGeneration: () => 3,
  acknowledgeViewRefresh: sync.acknowledgeViewRefresh,
  resolveSyncConflicts: sync.resolveSyncConflicts,
  dismissRejectedChanges: sync.dismissRejectedChanges,
  retrySync: sync.retrySync,
}));

import { useDataEpoch } from '../../src/hooks/useBackendSync';
import { SyncBanner, SyncStatusPanel } from '../../src/components/SyncStatus';

const baseStatus: BackendSyncStatus = {
  state: 'saved', pending: 0, rejected: [], conflicts: [], issues: [], resolving: false, lastSavedAt: null,
};

function EpochProbe() {
  const epoch = useDataEpoch();
  return (
    <main id="main-content">
      <output data-testid="epoch">{epoch}</output>
      <label htmlFor="draft">Draft</label>
      <input id="draft" />
      <button type="button">Plain button</button>
    </main>
  );
}

beforeEach(() => {
  sync.status = baseStatus;
  sync.acknowledgeViewRefresh.mockClear();
  sync.resolveSyncConflicts.mockClear();
  sync.dismissRejectedChanges.mockClear();
  sync.retrySync.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('data epoch', () => {
  it('remounts after a remote change and acknowledges the shown generation', async () => {
    render(<EpochProbe />);
    act(() => sync.remoteListener?.({ generation: 3, domains: ['expenseTracker'] }));
    await waitFor(() => expect(screen.getByTestId('epoch').textContent).toBe('1'));
    expect(sync.acknowledgeViewRefresh).toHaveBeenCalledWith(3);
  });

  it('waits while the user is typing in a field', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<EpochProbe />);
    screen.getByLabelText('Draft').focus();
    act(() => sync.remoteListener?.({ generation: 3, domains: ['calculator'] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByTestId('epoch').textContent).toBe('0');

    screen.getByRole('button', { name: 'Plain button' }).focus();
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(screen.getByTestId('epoch').textContent).toBe('1');
  });

  it('waits while a modal dialog is open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    render(<EpochProbe />);
    act(() => sync.remoteListener?.({ generation: 3, domains: ['netWorth'] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByTestId('epoch').textContent).toBe('0');
    dialog.remove();
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(screen.getByTestId('epoch').textContent).toBe('1');
  });
});

describe('sync status surfaces', () => {
  it('offers two explicit choices for a conflict and lists refused changes', () => {
    sync.status = {
      ...baseStatus,
      conflicts: ['expenseTracker', 'netWorth'],
      rejected: [{
        id: 'rej-1', domain: 'expenseTracker', createdAt: '2025-03-01T10:00:00.000Z', status: 400, code: 'invalid_body',
        message: 'Amount must be a finite non-negative number.', details: { collection: 'expenses', key: 'bad-1' }, changeset: {},
      }],
    };
    render(<SyncBanner dataEpoch={0} />);
    const region = screen.getByRole('region', { name: 'Database sync' });
    expect(region.textContent).toContain('Cashflow, Net worth');
    fireEvent.click(screen.getByRole('button', { name: 'Use the database copy' }));
    expect(sync.resolveSyncConflicts).toHaveBeenCalledWith('database');
    fireEvent.click(screen.getByRole('button', { name: "Replace the database with this device's data" }));
    expect(sync.resolveSyncConflicts).toHaveBeenCalledWith('device');
    expect(screen.getByText('1 change could not be saved')).toBeTruthy();
    expect(screen.getByText('Amount must be a finite non-negative number.')).toBeTruthy();
    expect(screen.getByText('Item: expenses bad-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all' }));
    expect(sync.dismissRejectedChanges).toHaveBeenCalledWith();
  });

  it('announces a refresh and stays hidden when there is nothing to decide', () => {
    const { rerender } = render(<SyncBanner dataEpoch={0} />);
    expect(screen.queryByRole('region')).toBeNull();
    rerender(<SyncBanner dataEpoch={1} />);
    expect(screen.getByRole('status').textContent).toBe('Updated with changes from the database.');
  });

  it('shows pending offline changes with a retry in Settings', () => {
    sync.status = { ...baseStatus, state: 'offline', pending: 2 };
    render(<SyncStatusPanel />);
    expect(screen.getByText('Offline. 2 changes are waiting to be saved.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(sync.retrySync).toHaveBeenCalledOnce();
  });

  it('is hidden when data stays on this device only', () => {
    sync.status = { ...baseStatus, state: 'disabled' };
    const { container } = render(<SyncStatusPanel />);
    expect(container.textContent).toBe('');
  });
});
