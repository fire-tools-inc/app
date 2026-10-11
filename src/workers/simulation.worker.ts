import { runMonteCarloSimulationWithLogs } from '../utils/monteCarlo';
import { runWithdrawalRateSweep } from '../utils/withdrawalRateSimulator';
import { getPortfolioDistribution, getYearsDistribution } from '../utils/monteCarloDistribution';
import type { MonteCarloDisplayResult, SimulationRequest } from '../utils/simulationWorker';
import { MAX_DETAILED_SIMULATIONS } from '../utils/simulationWorker';

self.onmessage = ({ data }: MessageEvent<SimulationRequest>) => {
  try {
    if (data.kind === 'monteCarlo') {
      const { inputs, mcInputs, captureLogs } = data.input;
      if (captureLogs && mcInputs.numSimulations > MAX_DETAILED_SIMULATIONS) {
        throw new Error('Detailed logs support up to 10000 simulations. Disable logs or lower the count.');
      }
      const result = runMonteCarloSimulationWithLogs(inputs, mcInputs, {
        captureLogs,
        onProgress: (completed, total) => self.postMessage({ type: 'progress', completed, total }),
      });
      const displayResult: MonteCarloDisplayResult = {
        successCount: result.successCount,
        failureCount: result.failureCount,
        successRate: result.successRate,
        medianYearsToFIRE: result.medianYearsToFIRE,
        logs: result.logs,
        fixedParameters: result.fixedParameters,
        yearsDistribution: getYearsDistribution(result),
        portfolioDistribution: getPortfolioDistribution(result),
      };
      self.postMessage({ type: 'result', result: displayResult });
    } else {
      const result = runWithdrawalRateSweep(data.input.inputs, data.input.rates);
      self.postMessage({ type: 'result', result });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
