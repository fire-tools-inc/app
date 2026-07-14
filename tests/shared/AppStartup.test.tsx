import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

const mocks = vi.hoisted(() => ({
  loadTourCompleted: vi.fn(),
  syncPreferencesFromBackend: vi.fn(),
}));

vi.mock('../../src/utils/tourPreferences', () => ({
  loadTourCompleted: mocks.loadTourCompleted,
}));

vi.mock('../../src/utils/uiPreferencesSync', () => ({
  syncPreferencesFromBackend: mocks.syncPreferencesFromBackend,
}));

vi.mock('../../src/contexts/AuditLogContext', () => ({
  AuditLogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../src/components/NotificationBell', () => ({
  NotificationBell: () => null,
}));

vi.mock('../../src/components/QuestionnairePrompt', () => ({
  QuestionnairePrompt: () => <div data-testid="questionnaire-prompt" />,
}));

vi.mock('../../src/components/GuidedTour', () => ({
  GuidedTour: () => <div data-testid="guided-tour" />,
}));

describe('App startup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    mocks.loadTourCompleted.mockReset().mockReturnValue(false);
    mocks.syncPreferencesFromBackend.mockReset().mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    act(() => cleanup());
    vi.useRealTimers();
  });

  it('renders the app immediately while backend preference sync is pending', () => {
    render(<App />);

    expect(document.querySelector('#main-content')).not.toBeNull();
    expect(screen.queryByTestId('guided-tour')).toBeNull();
    expect(screen.queryByTestId('questionnaire-prompt')).toBeNull();
  });

  it('reconciles preference-dependent UI when a slow sync completes', async () => {
    let resolveSync!: () => void;
    const syncPromise = new Promise<void>((resolve) => {
      resolveSync = resolve;
    });
    mocks.syncPreferencesFromBackend.mockReturnValue(syncPromise);

    render(<App />);

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    expect(screen.getByTestId('guided-tour')).not.toBeNull();
    expect(screen.getByTestId('questionnaire-prompt')).not.toBeNull();

    mocks.loadTourCompleted.mockReturnValue(true);
    await act(async () => {
      resolveSync();
      await syncPromise;
      await Promise.resolve();
    });

    expect(screen.queryByTestId('guided-tour')).toBeNull();
  });
});
