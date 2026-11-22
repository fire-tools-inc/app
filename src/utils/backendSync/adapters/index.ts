import type { DomainAdapter, SyncDomain } from '../types';
import { assetAllocationAdapter } from './assetAllocation';
import { calculatorAdapter } from './calculator';
import { expenseTrackerAdapter } from './expenseTracker';
import { netWorthAdapter } from './netWorth';
import { settingsAdapter } from './settings';

export const SYNC_ADAPTERS: Record<SyncDomain, DomainAdapter> = {
  settings: settingsAdapter as DomainAdapter,
  calculator: calculatorAdapter as DomainAdapter,
  assetAllocation: assetAllocationAdapter as DomainAdapter,
  expenseTracker: expenseTrackerAdapter as DomainAdapter,
  netWorth: netWorthAdapter as DomainAdapter,
};

export { assetAllocationAdapter, calculatorAdapter, expenseTrackerAdapter, netWorthAdapter, settingsAdapter };
