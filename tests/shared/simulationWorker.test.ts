import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INPUTS } from '../../src/utils/defaults';
import type { MonteCarloDisplayResult, SimulationMessage, SimulationRequest } from '../../src/utils/simulationWorker';

const postMessage = vi.fn<(message: SimulationMessage<MonteCarloDisplayResult>) => void>();
const scope: {
  onmessage: ((event: MessageEvent<SimulationRequest>) => void) | null;
  postMessage: typeof postMessage;
} = { onmessage: null, postMessage };

beforeEach(async () => {
  vi.resetModules();
  postMessage.mockClear();
  vi.stubGlobal('self', scope);
  await import('../../src/workers/simulation.worker');
});
afterEach(() => vi.unstubAllGlobals());

function run(numSimulations: number, captureLogs = false) {
  scope.onmessage?.(new MessageEvent<SimulationRequest>('message', {
    data: {
      kind: 'monteCarlo',
      input: {
        inputs: DEFAULT_INPUTS,
        mcInputs: { numSimulations, stockVolatility: 15, bondVolatility: 5, blackSwanProbability: 2, blackSwanImpact: -40 },
        captureLogs,
      },
    },
  }));
}

describe('simulation worker transport', () => {
  it('counts all 100000 runs but sends a compact chart-ready result', () => {
    run(100_000);
    const message = postMessage.mock.lastCall?.[0];
    expect(message?.type).toBe('result');
    if (message?.type !== 'result') throw new Error('Worker did not produce a result');
    expect(message.result.successCount + message.result.failureCount).toBe(100_000);
    expect(message.result.yearsDistribution.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(message.result.successCount);
    expect(message.result.logs).toEqual([]);
    expect(message.result).not.toHaveProperty('simulations');
    expect(JSON.stringify(message).length).toBeLessThan(15_000);
  });

  it('captures complete yearly logs when requested', () => {
    run(3, true);
    const message = postMessage.mock.lastCall?.[0];
    expect(message?.type).toBe('result');
    if (message?.type !== 'result') throw new Error('Worker did not produce a result');
    expect(message.result.logs).toHaveLength(3);
    expect(message.result.logs[0].yearlyData.length).toBeGreaterThan(0);
  });

  it('returns a clear error instead of an invalid success-shaped result', () => {
    run(0);
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'error', message: 'numSimulations must be an integer between 1 and 100000',
    });

    it('rejects oversized detailed logs before allocating their yearly records', () => {
      run(100_000, true);
      expect(postMessage).toHaveBeenLastCalledWith({
        type: 'error', message: 'Detailed logs support up to 10000 simulations. Disable logs or lower the count.',
      });
    });
  });
});
