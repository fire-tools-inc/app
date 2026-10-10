import type { CalculatorInputs, MonteCarloInputs, MonteCarloResultWithLogs } from '../types/calculator';
import type { WithdrawalRateInputs, WithdrawalRateResult } from './withdrawalRateSimulator';
import type { getPortfolioDistribution, getYearsDistribution } from './monteCarloDistribution';

export const MAX_DETAILED_SIMULATIONS = 10_000;

export interface MonteCarloDisplayResult extends Omit<MonteCarloResultWithLogs, 'simulations'> {
  yearsDistribution: ReturnType<typeof getYearsDistribution>;
  portfolioDistribution: ReturnType<typeof getPortfolioDistribution>;
}

export interface SimulationTasks {
  monteCarlo: {
    input: { inputs: CalculatorInputs; mcInputs: MonteCarloInputs; captureLogs: boolean };
    result: MonteCarloDisplayResult;
  };
  withdrawalRate: {
    input: { inputs: WithdrawalRateInputs; rates: number[] };
    result: WithdrawalRateResult[];
  };
}

export type SimulationKind = keyof SimulationTasks;
export type SimulationRequest = {
  [Kind in SimulationKind]: { kind: Kind; input: SimulationTasks[Kind]['input'] }
}[SimulationKind];

export type SimulationMessage<Result> =
  | { type: 'result'; result: Result }
  | { type: 'progress'; completed: number; total: number }
  | { type: 'error'; message: string };
