import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfileBadge } from '../../src/components/ProfileBadge';

afterEach(cleanup);

describe('Portfolio profile identity', () => {
  it('does not duplicate sidebar Settings or expose an empty action menu', () => {
    render(<MemoryRouter><ProfileBadge accountName="Synthetic Portfolio" showAccountName /></MemoryRouter>);
    fireEvent.click(screen.getByText('SP'));
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Synthetic Portfolio')).toBeTruthy();
  });
});
