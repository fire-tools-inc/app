import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonteCarloSimulator } from '../../../src/components/MonteCarloSimulator';
import { MemoryRouter } from 'react-router';
import { DEFAULT_INPUTS } from '../../../src/utils/defaults';

const worker = vi.hoisted(() => ({
  result: null, isRunning: false, error: null, progress: 0, run: vi.fn(), cancel: vi.fn(),
}));
vi.mock('../../../src/hooks/useSimulationWorker', () => ({ useSimulationWorker: () => worker }));
vi.mock('../../../src/components/MonteCarloChart', () => ({ MonteCarloChart: () => null }));
vi.mock('../../../src/components/MonteCarloLogs', () => ({ MonteCarloLogs: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Monte Carlo controls', () => {
  it('runs the maximum count without detailed logs by default', () => {
    render(<MemoryRouter><MonteCarloSimulator inputs={DEFAULT_INPUTS} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Number of Simulations'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run Monte Carlo simulations' }));
    expect(worker.run).toHaveBeenCalledWith(expect.objectContaining({
      captureLogs: false, mcInputs: expect.objectContaining({ numSimulations: 100000 }),
    }));
  });

  it('requires an explicit lower count for memory-intensive detailed logs', () => {
    render(<MemoryRouter><MonteCarloSimulator inputs={DEFAULT_INPUTS} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Number of Simulations'), { target: { value: '100000' } });
    fireEvent.click(screen.getByLabelText('Capture detailed simulation logs'));
    expect(screen.getByText(/Detailed logs support up to 10,000/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fix validation errors to run simulations' }).hasAttribute('disabled')).toBe(true);
    expect(worker.run).not.toHaveBeenCalled();
  });
});
