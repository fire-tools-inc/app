import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppNavigation } from '../../src/components/AppNavigation';
import { NAVBAR_LABELS } from '../../src/constants/navbarLabels';

vi.mock('../../src/components/NotificationBell', () => ({
  NotificationBell: () => <button>Notifications</button>,
}));
vi.mock('../../src/components/ProfileMenu', () => ({
  ProfileMenu: ({ accountName }: { accountName: string }) => <button className="profile-icon-button">{accountName}</button>,
}));

function Harness({ showPortfolioBreakdown = false }: { showPortfolioBreakdown?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <MemoryRouter initialEntries={['/asset-allocation']}>
      <AppNavigation accountName="Test portfolio" showPortfolioBreakdown={showPortfolioBreakdown} isOpen={isOpen} onOpenChange={setIsOpen} />
      <main id="main-content" tabIndex={-1}>Test page</main>
    </MemoryRouter>
  );
}

function setCompact(compact: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: compact,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App sidebar navigation', () => {
  it('exposes labelled destinations directly instead of hiding tools in a top menu', () => {
    setCompact(false);
    render(<Harness />);
    for (const label of [
      NAVBAR_LABELS.home, NAVBAR_LABELS.assetAllocation, NAVBAR_LABELS.cashflow,
      NAVBAR_LABELS.netWorth, NAVBAR_LABELS.fireCalculator, NAVBAR_LABELS.monteCarlo,
      NAVBAR_LABELS.investmentGrowth, NAVBAR_LABELS.withdrawalRate,
      NAVBAR_LABELS.portfolioBacktest, NAVBAR_LABELS.debtPayoff,
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: NAVBAR_LABELS.assetAllocation }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('button', { name: NAVBAR_LABELS.tools })).toBeNull();
    expect(document.querySelector('.app-navigation')).not.toBeNull();
  });

  it('keeps experimental navigation behind its existing feature flag', () => {
    setCompact(false);
    const { unmount } = render(<Harness />);
    expect(screen.queryByRole('link', { name: NAVBAR_LABELS.portfolioBreakdown })).toBeNull();
    unmount();
    render(<Harness showPortfolioBreakdown />);
    expect(screen.getByRole('link', { name: NAVBAR_LABELS.portfolioBreakdown })).toBeTruthy();
  });

  it('places the profile above the menu and utilities below the divider', () => {
    setCompact(false);
    render(<Harness />);
    const profile = screen.getByRole('button', { name: 'Test portfolio' });
    expect(document.querySelector('.app-navigation-header')?.contains(profile)).toBe(true);
    const footer = document.querySelector('.app-navigation-footer')!;
    expect(footer.contains(screen.getByRole('link', { name: NAVBAR_LABELS.settings }))).toBe(true);
    expect(footer.contains(screen.getByRole('button', { name: 'Notifications' }))).toBe(true);
    expect(footer.contains(profile)).toBe(false);
  });

  it('opens a keyboard-accessible drawer and restores focus on Escape', () => {
    setCompact(true);
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: NAVBAR_LABELS.toggle });
    fireEvent.click(toggle);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect(document.body.style.overflow).toBe('');
  });

  it('closes the drawer after navigation without dropping destinations', () => {
    setCompact(true);
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: NAVBAR_LABELS.toggle });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('link', { name: NAVBAR_LABELS.netWorth }));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps keyboard focus within an open mobile drawer', () => {
    setCompact(true);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: NAVBAR_LABELS.toggle }));
    const first = screen.getByRole('button', { name: 'Test portfolio' });
    const last = screen.getByRole('button', { name: 'Notifications' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
