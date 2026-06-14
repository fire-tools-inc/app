/**
 * FIRE Calculator Scenario (bookmark) types
 *
 * Scenarios let users bookmark a set of FIRE calculator parameters under a
 * name so they can compare and restore different plans. A maximum of
 * MAX_SCENARIOS scenarios can be stored at once.
 */

import { CalculatorInputs } from './calculator';

/**
 * Maximum number of scenarios a user can bookmark.
 */
export const MAX_SCENARIOS = 5;

export interface FireScenario {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
  inputs: CalculatorInputs;
}
