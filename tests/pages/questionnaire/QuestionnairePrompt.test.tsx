import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionnairePrompt } from '../../../src/components/QuestionnairePrompt';

const mocks = vi.hoisted(() => ({
  hasCompletedQuestionnaire: vi.fn(),
  loadQuestionnairePromptDismissed: vi.fn(),
  loadTourCompleted: vi.fn(),
  saveQuestionnairePromptDismissed: vi.fn(),
}));

vi.mock('../../../src/utils/tourPreferences', () => ({
  loadTourCompleted: mocks.loadTourCompleted,
}));

vi.mock('../../../src/utils/questionnaireStorage', () => ({
  hasCompletedQuestionnaire: mocks.hasCompletedQuestionnaire,
}));

vi.mock('../../../src/utils/questionnairePromptPreferences', () => ({
  loadQuestionnairePromptDismissed: mocks.loadQuestionnairePromptDismissed,
  saveQuestionnairePromptDismissed: mocks.saveQuestionnairePromptDismissed,
}));

describe('QuestionnairePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.loadTourCompleted.mockReset().mockReturnValue(true);
    mocks.hasCompletedQuestionnaire.mockReset().mockReturnValue(false);
    mocks.loadQuestionnairePromptDismissed.mockReset().mockReturnValue(false);
    mocks.saveQuestionnairePromptDismissed.mockReset();
  });

  afterEach(() => {
    act(() => cleanup());
    vi.useRealTimers();
  });

  it('rechecks persisted preferences when backend sync completes', () => {
    const { rerender } = render(
      <QuestionnairePrompt preferencesRevision={1} />,
      { wrapper: MemoryRouter },
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('dialog')).not.toBeNull();

    mocks.loadQuestionnairePromptDismissed.mockReturnValue(true);
    rerender(<QuestionnairePrompt preferencesRevision={2} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not reopen after the user asks to be reminded later', () => {
    const { rerender } = render(
      <QuestionnairePrompt preferencesRevision={1} />,
      { wrapper: MemoryRouter },
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remind Me Later' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(<QuestionnairePrompt preferencesRevision={2} />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
