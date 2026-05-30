/**
 * Demo mode detection + data seeding.
 *
 * The SPA is the public demo: every web build (dev server, GitHub Pages,
 * any HTTP(S) host) boots as a sandbox with mock data and disabled
 * persistence. Only Electron (file://) and the unit tests opt out.
 * Self-hosted users get the full app via Electron or by pointing the
 * Electron shell at their own backend.
 */

import type { Asset, AssetClass, AllocationMode } from '../types/assetAllocation';
import type { CalculatorInputs } from '../types/calculator';
import type { ExpenseTrackerData } from '../types/expenseTracker';
import type { NetWorthTrackerData } from '../types/netWorthTracker';
import {
  DEFAULT_INPUTS,
  getDemoAssetAllocationData,
  getDemoCashflowData,
  getDemoNetWorthData,
} from './defaults';

function detectDemoMode(): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  // Electron loads via file:// — never demo there.
  if (window.location.protocol === 'file:') {
    return false;
  }
  // Disable in test environments (Vitest sets MODE='test').
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test') {
      return false;
    }
  } catch {
    // ignore
  }
  // Explicit opt-out for local debugging / dev tests that need real persistence.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '0') {
      return false;
    }
  } catch {
    // ignore malformed URLs
  }
  // Every other web context (dev server, GitHub Pages, self-hosted) = demo.
  return true;
}

export const IS_DEMO_MODE: boolean = detectDemoMode();

// Memoise the seed so navigations don't reshuffle randomised demo data.
let cachedAssetAllocation: {
  assets: Asset[];
  assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>;
} | null = null;
let cachedExpenseTracker: ExpenseTrackerData | null = null;
let cachedNetWorthTracker: NetWorthTrackerData | null = null;

export function getDemoCalculatorInputs(): CalculatorInputs {
  return { ...DEFAULT_INPUTS };
}

export function getDemoAssetAllocation() {
  if (!cachedAssetAllocation) {
    cachedAssetAllocation = getDemoAssetAllocationData();
  }
  return cachedAssetAllocation;
}

export function getDemoExpenseTracker(): ExpenseTrackerData {
  if (!cachedExpenseTracker) {
    cachedExpenseTracker = getDemoCashflowData();
  }
  return cachedExpenseTracker;
}

export function getDemoNetWorthTracker(): NetWorthTrackerData {
  if (!cachedNetWorthTracker) {
    cachedNetWorthTracker = getDemoNetWorthData();
  }
  return cachedNetWorthTracker;
}
