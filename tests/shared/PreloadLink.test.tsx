import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreloadLink } from '../../src/components/PreloadLink';
import { preloadRoute } from '../../src/routes/lazyPages';

vi.mock('../../src/routes/lazyPages', () => ({
  preloadRoute: vi.fn(),
}));

describe('PreloadLink', () => {
  beforeEach(() => {
    vi.mocked(preloadRoute).mockClear();
  });

  it('preloads the destination when the user signals navigation intent', () => {
    render(
      <MemoryRouter>
        <PreloadLink to="/fire-calculator">FIRE Calculator</PreloadLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'FIRE Calculator' });
    fireEvent.pointerEnter(link);
    fireEvent.pointerDown(link);
    fireEvent.focus(link);

    expect(preloadRoute).toHaveBeenCalledTimes(3);
    expect(preloadRoute).toHaveBeenCalledWith('/fire-calculator');
  });

  it('preserves caller event handlers', () => {
    const onFocus = vi.fn();
    render(
      <MemoryRouter>
        <PreloadLink to="/settings" onFocus={onFocus}>Settings</PreloadLink>
      </MemoryRouter>,
    );

    fireEvent.focus(screen.getByRole('link', { name: 'Settings' }));

    expect(onFocus).toHaveBeenCalledOnce();
    expect(preloadRoute).toHaveBeenCalledWith('/settings');
  });
});
