/**
 * Questionnaire Storage utilities
 * Handles saving/loading questionnaire results using encrypted cookies
 */

import SafeCookies from './safeCookies';
import type { CookieAttributes } from './safeCookies';
import { QuestionnaireResults } from '../types/questionnaire';
import { encryptData, decryptData } from './cookieEncryption';
import { logger } from './logger';

// Storage key
const QUESTIONNAIRE_RESULTS_KEY = 'fire-tools-questionnaire-results';

// Cookie options - secure settings for production
const COOKIE_OPTIONS: CookieAttributes = {
  expires: 365, // 1 year
  sameSite: 'strict',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  path: '/',
};

/**
 * Validate questionnaire results structure
 */
function isValidQuestionnaireResults(obj: any): obj is QuestionnaireResults {
  return (
    typeof obj === 'object' &&
    typeof obj.persona === 'string' &&
    typeof obj.personaExplanation === 'string' &&
    typeof obj.safeWithdrawalRate === 'number' &&
    typeof obj.suggestedSavingsRate === 'number' &&
    typeof obj.assetAllocation === 'object' &&
    Array.isArray(obj.suitableAssets) &&
    typeof obj.riskTolerance === 'string' &&
    Array.isArray(obj.responses) &&
    typeof obj.completedAt === 'string'
  );
}

/**
 * Save questionnaire results to encrypted storage
 */
export function saveQuestionnaireResults(results: QuestionnaireResults): void {
  try {
    const resultsJson = JSON.stringify(results);
    const encryptedResults = encryptData(resultsJson);

    SafeCookies.set(QUESTIONNAIRE_RESULTS_KEY, encryptedResults, COOKIE_OPTIONS);
  } catch (error) {
    logger.error('questionnaire-storage', 'save-failed', 'failed to save questionnaire results', { pii: { error: (error as Error)?.message } });
    throw new Error('Failed to save questionnaire results.');
  }
}

/**
 * Load questionnaire results from encrypted storage
 */
export function loadQuestionnaireResults(): QuestionnaireResults | null {
  try {
    const encryptedResults = SafeCookies.get(QUESTIONNAIRE_RESULTS_KEY);
    if (!encryptedResults) {
      return null;
    }

    const decryptedResults = decryptData(encryptedResults);
    if (!decryptedResults) {
      return null;
    }

    const parsed = JSON.parse(decryptedResults);
    if (isValidQuestionnaireResults(parsed)) {
      return parsed;
    }

    return null;
  } catch (error) {
    logger.error('questionnaire-storage', 'load-failed', 'failed to load questionnaire results', { pii: { error: (error as Error)?.message } });
    return null;
  }
}

/**
 * Clear questionnaire results from storage
 */
export function clearQuestionnaireResults(): void {
  try {
    SafeCookies.remove(QUESTIONNAIRE_RESULTS_KEY, { path: '/' });
  } catch (error) {
    logger.error('questionnaire-storage', 'clear-failed', 'failed to clear questionnaire results', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Check if questionnaire has been completed
 */
export function hasCompletedQuestionnaire(): boolean {
  return loadQuestionnaireResults() !== null;
}
