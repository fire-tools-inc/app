import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyableValue } from './CopyableValue';

describe('CopyableValue', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders the value inside a button', () => {
    render(<CopyableValue value="1.2.3" />);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain('1.2.3');
  });

  it('writes the value to the clipboard on click', async () => {
    render(<CopyableValue value="1.2.3" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('1.2.3');
    });
  });

  it('shows a "copied" indicator after a successful copy', async () => {
    render(<CopyableValue value="abc" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByRole('button').className).toMatch(/copyable-value--copied/);
    });
  });
});
