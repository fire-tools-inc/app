import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartZoomControls } from '../../src/components/ChartZoomControls';

afterEach(cleanup);

describe('Chart zoom controls', () => {
  it('keeps all presets accessible and identifies the selected range', () => {
    const change = vi.fn();
    render(<ChartZoomControls zoomYears={30} onZoomChange={change} customZoomInput="" onCustomZoomInputChange={vi.fn()} />);
    const selected = screen.getByRole('button', { name: /30/ });
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /20/ }));
    fireEvent.click(screen.getByRole('button', { name: /40/ }));
    fireEvent.click(screen.getByRole('button', { name: /all years/i }));
    expect(change.mock.calls.map(call => call[0])).toEqual([20, 40, 'all']);
  });

  it('applies a custom range with the keyboard and on blur', () => {
    const change = vi.fn();
    render(<ChartZoomControls zoomYears={30} onZoomChange={change} customZoomInput="15" onCustomZoomInputChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledTimes(2);
    expect(change).toHaveBeenLastCalledWith(15);
  });

  it('does not silently truncate a fractional custom horizon', () => {
    const change = vi.fn();
    render(<ChartZoomControls zoomYears={30} onZoomChange={change} customZoomInput="1.5" onCustomZoomInputChange={vi.fn()} />);
    fireEvent.blur(screen.getByRole('spinbutton'));
    expect(change).not.toHaveBeenCalled();
  });
});
