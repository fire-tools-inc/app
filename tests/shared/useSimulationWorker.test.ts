import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimulationWorker } from '../../src/hooks/useSimulationWorker';
import { DEFAULT_INPUTS } from '../../src/utils/defaults';
import type { MonteCarloResultWithLogs } from '../../src/types/calculator';
import type { SimulationMessage } from '../../src/utils/simulationWorker';

vi.mock('../../src/utils/logger', () => ({ logger: { error: vi.fn() } }));

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<SimulationMessage<MonteCarloResultWithLogs>>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    FakeWorker.instances.push(this);
  }

  emit(data: SimulationMessage<MonteCarloResultWithLogs>) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

const input = {
  inputs: DEFAULT_INPUTS,
  mcInputs: { numSimulations: 1000, stockVolatility: 15, bondVolatility: 5, blackSwanProbability: 2, blackSwanImpact: -40 },
  captureLogs: false,
};

describe('useSimulationWorker', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('runs outside the render path and reports progress', () => {
    const { result } = renderHook(() => useSimulationWorker('monteCarlo'));
    act(() => result.current.run(input));
    const worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith({ kind: 'monteCarlo', input });
    expect(result.current.isRunning).toBe(true);
    act(() => worker.emit({ type: 'progress', completed: 500, total: 1000 }));
    expect(result.current.progress).toBe(50);
  });

  it('terminates a previous run and ignores its late results', () => {
    const { result } = renderHook(() => useSimulationWorker('monteCarlo'));
    act(() => result.current.run(input));
    const oldWorker = FakeWorker.instances[0];
    act(() => result.current.run(input));
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    act(() => oldWorker.emit({ type: 'error', message: 'Stale failure' }));
    expect(result.current.error).toBeNull();
    expect(result.current.isRunning).toBe(true);
  });

  it('coalesces frequent progress messages instead of repainting the entire page for each run', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSimulationWorker('monteCarlo');
    });
    act(() => result.current.run(input));
    const initialRenders = renders;
    const worker = FakeWorker.instances[0];
    for (let completed = 1; completed <= 100; completed++) {
      act(() => worker.emit({ type: 'progress', completed, total: 100 }));
    }
    expect(result.current.progress).toBe(100);
    expect(renders - initialRenders).toBeLessThanOrEqual(20);
  });

  it('surfaces a worker error and frees the worker', () => {
    const { result } = renderHook(() => useSimulationWorker('monteCarlo'));
    act(() => result.current.run(input));
    const worker = FakeWorker.instances[0];
    act(() => worker.emit({ type: 'error', message: 'Invalid allocation' }));
    expect(result.current.error).toBe('Invalid allocation');
    expect(result.current.isRunning).toBe(false);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancels promptly and cleans up on unmount', () => {
    const { result, unmount } = renderHook(() => useSimulationWorker('monteCarlo'));
    act(() => result.current.run(input));
    const first = FakeWorker.instances[0];
    act(() => result.current.cancel());
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(result.current.isRunning).toBe(false);
    act(() => result.current.run(input));
    const second = FakeWorker.instances[1];
    unmount();
    expect(second.terminate).toHaveBeenCalledOnce();
  });

  it('reports a startup failure instead of staying busy', () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('Worker unavailable'); } });
    const { result } = renderHook(() => useSimulationWorker('monteCarlo'));
    act(() => result.current.run(input));
    expect(result.current.error).toBe('Worker unavailable');
    expect(result.current.isRunning).toBe(false);
  });
});
