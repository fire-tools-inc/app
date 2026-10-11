import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MonteCarloChart } from '../../../src/components/MonteCarloChart';
import { getYearsDistribution } from '../../../src/utils/monteCarloDistribution';
import type { MonteCarloResult } from '../../../src/types/calculator';

afterEach(cleanup);

describe('Monte Carlo histogram', () => {
  it('renders every bin and its count without mounting a heavyweight chart renderer', () => {
    const result: MonteCarloResult = {
      successCount: 3, failureCount: 0, successRate: 100, medianYearsToFIRE: 1,
      simulations: [0, 1, 2].map((year, index) => ({
        simulationId: index + 1, success: true, yearsToFIRE: year, finalPortfolio: 100,
      })),
    };
    render(<MonteCarloChart yearsDistribution={getYearsDistribution(result)} portfolioDistribution={null} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(document.querySelectorAll('.histogram-count')).toHaveLength(3);
    expect(document.querySelectorAll('.histogram-bin--median')).toHaveLength(1);
    expect(document.querySelector('.recharts-wrapper')).toBeNull();
  });

  it('still shows portfolio losses when no run reaches FIRE', () => {
    render(<MonteCarloChart yearsDistribution={{ bins: [], stats: null }} portfolioDistribution={{
      min: 0, max: 0, median: 0, percentile10: 0, percentile90: 0,
    }} />);
    expect(document.getElementById('portfolio-stats-heading')).not.toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
