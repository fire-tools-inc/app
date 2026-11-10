import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionnairePage } from '../../../src/components/QuestionnairePage';

const mocks = vi.hoisted(() => ({ save: vi.fn(), calculate: vi.fn() }));
vi.mock('../../../src/utils/questionnaireStorage', () => ({
  loadQuestionnaireResults: () => null,
  saveQuestionnaireResults: mocks.save,
  clearQuestionnaireResults: vi.fn(),
}));
vi.mock('../../../src/utils/questionnaireLogic', () => ({
  QUESTIONNAIRE_QUESTIONS: [
    { id: 'q1', category: 'goals', text: 'Test question one', options: [{ id: 'a', label: 'First choice' }] },
    { id: 'q2', category: 'goals', text: 'Test question two', options: [{ id: 'b', label: 'Final choice' }] },
  ],
  calculateFIREPersona: mocks.calculate,
  getPersonaInfo: vi.fn(),
}));

describe('Questionnaire navigation', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not calculate or save delayed results after leaving the page', () => {
    vi.useFakeTimers();
    const { unmount } = render(<MemoryRouter><QuestionnairePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'First choice' }));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Final choice' }));
    unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(mocks.calculate).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
