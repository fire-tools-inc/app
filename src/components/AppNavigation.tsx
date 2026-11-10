import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { NAVBAR_LABELS, type NavbarLabelKey } from '../constants/navbarLabels';
import { FireIcon } from './FireIcon';
import { MaterialIcon } from './MaterialIcon';
import { NotificationBell } from './NotificationBell';
import { PreloadLink } from './PreloadLink';
import { ProfileBadge } from './ProfileBadge';
import './AppNavigation.css';

interface NavigationItem {
  path: string;
  label: NavbarLabelKey;
  icon: string;
}

const TRACKING_ITEMS: NavigationItem[] = [
  { path: '/asset-allocation', label: 'assetAllocation', icon: 'pie_chart' },
  { path: '/expense-tracker', label: 'cashflow', icon: 'account_balance_wallet' },
  { path: '/net-worth-tracker', label: 'netWorth', icon: 'paid' },
];

const PLANNING_ITEMS: NavigationItem[] = [
  { path: '/fire-calculator', label: 'fireCalculator', icon: 'local_fire_department' },
  { path: '/reverse-fire-calculator', label: 'reverseFireCalculator', icon: 'undo' },
  { path: '/monte-carlo', label: 'monteCarlo', icon: 'ssid_chart' },
  { path: '/investment-growth', label: 'investmentGrowth', icon: 'trending_up' },
  { path: '/withdrawal-rate', label: 'withdrawalRate', icon: 'trending_down' },
  { path: '/portfolio-backtest', label: 'portfolioBacktest', icon: 'analytics' },
  { path: '/debt-payoff', label: 'debtPayoff', icon: 'credit_score' },
  { path: '/questionnaire', label: 'questionnaire', icon: 'quiz' },
];

interface AppNavigationProps {
  accountName: string;
  showPortfolioBreakdown: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

const COMPACT_QUERY = '(max-width: 999px)';

export function AppNavigation({ accountName, showPortfolioBreakdown, isOpen, onOpenChange, isCollapsed, onCollapsedChange }: AppNavigationProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [isCompact, setIsCompact] = useState(() => window.matchMedia?.(COMPACT_QUERY).matches ?? false);
  const panelRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const desktopCollapsed = isCollapsed && !isCompact;

  const closeMenu = useCallback(() => {
    onOpenChange(false);
    if (isCompact) toggleRef.current?.focus();
  }, [isCompact, onOpenChange]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => {
      setIsCompact(media.matches);
      if (!media.matches) onOpenChange(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [onOpenChange]);

  useEffect(() => {
    onOpenChange(false);
  }, [location.pathname, onOpenChange]);

  useEffect(() => {
    if (!isCompact || !isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('[aria-current="page"], a[href]')?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      } else if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCompact, isOpen, closeMenu]);

  const renderItem = ({ path, label, icon }: NavigationItem) => (
    <PreloadLink
      key={path}
      to={path}
      className={`app-navigation-link${location.pathname === path ? ' active' : ''}`}
      aria-current={location.pathname === path ? 'page' : undefined}
      aria-label={NAVBAR_LABELS[label]}
      title={desktopCollapsed ? NAVBAR_LABELS[label] : undefined}
      onClick={closeMenu}
    >
      <MaterialIcon name={icon} size="small" />
      <span className="app-navigation-label">{NAVBAR_LABELS[label]}</span>
    </PreloadLink>
  );

  return (
    <>
      <header className="app-mobile-header">
        <span className="app-mobile-brand"><FireIcon size={24} /> {t('app.title')}</span>
        <button
          ref={toggleRef}
          type="button"
          className="app-menu-toggle"
          onClick={() => onOpenChange(!isOpen)}
          aria-label={NAVBAR_LABELS.toggle}
          aria-expanded={isOpen}
          aria-controls="app-navigation-panel"
        >
          <MaterialIcon name="menu" size="small" />
          {NAVBAR_LABELS.menu}
        </button>
      </header>
      {isCompact && isOpen && (
        <button type="button" className="app-navigation-backdrop" onClick={closeMenu} tabIndex={-1} aria-label={NAVBAR_LABELS.close} />
      )}
      <aside
        ref={panelRef}
        id="app-navigation-panel"
        className={`app-navigation${isOpen ? ' is-open' : ''}${desktopCollapsed ? ' is-collapsed' : ''}`}
        role={isCompact && isOpen ? 'dialog' : undefined}
        aria-modal={isCompact && isOpen ? true : undefined}
        aria-label={isCompact && isOpen ? NAVBAR_LABELS.ariaLabel : undefined}
      >
        <div className="app-navigation-header">
          <ProfileBadge accountName={accountName} showAccountName={!desktopCollapsed} />
          <div className="app-navigation-identity">
            <PreloadLink to="/" className="app-navigation-brand" onClick={closeMenu} aria-label={t('app.title')}>
              <FireIcon size={28} />
              <h1>{t('app.title')}</h1>
            </PreloadLink>
            {!isCompact && (
              <button
                type="button"
                className="app-navigation-collapse"
                aria-label={desktopCollapsed ? NAVBAR_LABELS.expand : NAVBAR_LABELS.collapse}
                title={desktopCollapsed ? NAVBAR_LABELS.expand : NAVBAR_LABELS.collapse}
                aria-expanded={!desktopCollapsed}
                aria-controls="app-navigation-list"
                onClick={() => onCollapsedChange(!isCollapsed)}
              >
                <MaterialIcon name={desktopCollapsed ? 'chevron_right' : 'chevron_left'} size="small" />
              </button>
            )}
          </div>
          <button type="button" className="app-navigation-close" aria-label={NAVBAR_LABELS.close} onClick={closeMenu}>
            <MaterialIcon name="close" size="small" />
          </button>
        </div>
        <nav id="app-navigation-list" className="app-navigation-list" aria-label={NAVBAR_LABELS.ariaLabel}>
          {renderItem({ path: '/', label: 'home', icon: 'home' })}
          <div className="app-navigation-group">
            <p className="app-navigation-group-title">{NAVBAR_LABELS.tracking}</p>
            {TRACKING_ITEMS.map(renderItem)}
            {showPortfolioBreakdown && renderItem({ path: '/portfolio-breakdown', label: 'portfolioBreakdown', icon: 'donut_large' })}
          </div>
          <div className="app-navigation-group">
            <p className="app-navigation-group-title">{NAVBAR_LABELS.planning}</p>
            {PLANNING_ITEMS.map(renderItem)}
          </div>
        </nav>
        <div className="app-navigation-footer">
          {renderItem({ path: '/settings', label: 'settings', icon: 'settings' })}
          <NotificationBell showLabel={!desktopCollapsed} />
        </div>
      </aside>
    </>
  );
}
