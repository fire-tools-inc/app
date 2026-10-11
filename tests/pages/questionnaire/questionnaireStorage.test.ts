/**
 * Tests for Questionnaire Storage utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import SafeCookies from '../../../src/utils/safeCookies';
import {
  saveQuestionnaireResults,
  loadQuestionnaireResults,
  clearQuestionnaireResults,
  hasCompletedQuestionnaire,
} from '../../../src/utils/questionnaireStorage';
import { QuestionnaireResults } from '../../../src/types/questionnaire';
import { expectDiagnostic } from '../../shared/diagnostics';

// Mock the storage shim (replaces former js-cookie mock)
vi.mock('../../../src/utils/safeCookies', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

const Cookies = SafeCookies;

// Mock cookieEncryption
vi.mock('../../../src/utils/cookieEncryption', () => ({
  encryptData: vi.fn((data: string) => `encrypted:${data}`),
  decryptData: vi.fn((data: string) => data.replace('encrypted:', '')),
}));

const mockResults: QuestionnaireResults = {
  persona: 'REGULAR_FIRE',
  personaExplanation: 'Test explanation',
  safeWithdrawalRate: 4.0,
  suggestedSavingsRate: 50,
  assetAllocation: { stocks: 70, bonds: 20, cash: 10 },
  suitableAssets: ['Index funds', 'ETFs'],
  riskTolerance: 'moderate',
  responses: [{ questionId: 'q1', selectedOptionId: 'opt1' }],
  completedAt: '2024-01-01T00:00:00.000Z',
};

describe('questionnaireStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Cookies.set).mockReset();
  });

  describe('saveQuestionnaireResults', () => {
    it('should save results to cookies', () => {
      saveQuestionnaireResults(mockResults);

      expect(Cookies.set).toHaveBeenCalledTimes(1);
      expect(Cookies.set).toHaveBeenCalledWith(
        'fire-tools-questionnaire-results',
        expect.stringContaining('encrypted:'),
        expect.objectContaining({
          expires: 365,
          sameSite: 'strict',
          path: '/',
        })
      );
    });

    it('should throw error when cookies are disabled', () => {
      vi.mocked(Cookies.set).mockImplementation(() => {
        throw new Error('Cookies disabled');
      });

      expect(() => saveQuestionnaireResults(mockResults)).toThrow(
        'Failed to save questionnaire results.'
      );
      expectDiagnostic('error', '[save-failed]: failed to save questionnaire results');
    });
  });

  describe('loadQuestionnaireResults', () => {
    it('should return null when no results are saved', () => {
      vi.mocked(Cookies.get).mockReturnValue(undefined);

      const result = loadQuestionnaireResults();

      expect(result).toBeNull();
    });

    it('should return results when saved', () => {
      vi.mocked(Cookies.get).mockReturnValue(
        `encrypted:${JSON.stringify(mockResults)}`
      );

      const result = loadQuestionnaireResults();

      expect(result).toEqual(mockResults);
    });

    it('should return null for invalid data structure', () => {
      vi.mocked(Cookies.get).mockReturnValue(
        `encrypted:${JSON.stringify({ invalid: 'data' })}`
      );

      const result = loadQuestionnaireResults();

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON data', () => {
      vi.mocked(Cookies.get).mockReturnValue('encrypted:invalid-json');

      const result = loadQuestionnaireResults();

      expect(result).toBeNull();
      expectDiagnostic('error', '[load-failed]: failed to load questionnaire results');
    });
  });

  describe('clearQuestionnaireResults', () => {
    it('should remove results from cookies', () => {
      clearQuestionnaireResults();

      expect(Cookies.remove).toHaveBeenCalledWith(
        'fire-tools-questionnaire-results',
        { path: '/' }
      );
    });
  });

  describe('hasCompletedQuestionnaire', () => {
    it('should return true when results exist', () => {
      vi.mocked(Cookies.get).mockReturnValue(
        `encrypted:${JSON.stringify(mockResults)}`
      );

      const result = hasCompletedQuestionnaire();

      expect(result).toBe(true);
    });

    it('should return false when no results exist', () => {
      vi.mocked(Cookies.get).mockReturnValue(undefined);

      const result = hasCompletedQuestionnaire();

      expect(result).toBe(false);
    });
  });
});
