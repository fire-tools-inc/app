import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeferredRender } from '../../src/hooks/useDeferredRender';

describe('useDeferredRender', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    vi.stubGlobal(
      'requestIdleCallback',
      (callback: IdleRequestCallback) => window.setTimeout(
        () => callback({ didTimeout: false, timeRemaining: () => 10 }),
        0,
      ),
    );
    vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    act(() => cleanup());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for initial paint and a grace period before rendering deferred content', () => {
    const { result } = renderHook(() => useDeferredRender());

    act(() => {
      vi.advanceTimersByTime(181);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
      vi.runOnlyPendingTimers();
    });
    expect(result.current).toBe(true);
  });

  it('cancels deferred work when the content is disabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useDeferredRender(enabled),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    act(() => {
      vi.runAllTimers();
    });

    expect(result.current).toBe(false);
  });
});
