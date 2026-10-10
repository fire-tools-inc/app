import { BrowserRouter, HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router';
// Use HashRouter under file:// (Electron) so deep links work without a server.
const Router = typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
import { createContext, lazy, startTransition, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HomePage } from './components/HomePage';
import { ProfileMenu } from './components/ProfileMenu';
import { ToolsMenu } from './components/ToolsMenu';
import { NotificationBell } from './components/NotificationBell';
import { CookieConsent } from './components/CookieConsent';
import { DemoBanner } from './components/DemoBanner';
import { NotFoundPage } from './components/NotFoundPage';
import { QuestionnairePrompt } from './components/QuestionnairePrompt';
import { PolicyModal } from './components/PolicyModal';
import type { PolicyType } from './components/PolicyModal';
import { PreloadLink } from './components/PreloadLink';
import { AuditLogProvider } from './contexts/AuditLogContext';
import { loadSettings, type UserSettings } from './utils/cookieSettings';
import { loadTourCompleted } from './utils/tourPreferences';
import { syncPreferencesFromBackend } from './utils/uiPreferencesSync';
import { logger } from './utils/logger';
import {
  LazyAssetAllocationPage,
  LazyDebtPayoffPage,
  LazyExpenseTrackerPage,
  LazyFIRECalculatorPage,
  LazyInvestmentGrowthPage,
  LazyMonteCarloPage,
  LazyNetWorthTrackerPage,
  LazyPortfolioBacktestPage,
  LazyPortfolioBreakdownPage,
  LazyQuestionnairePage,
  LazyReverseFIRECalculatorPage,
  LazySettingsPage,
  LazyWithdrawalRatePage,
  preloadRoute,
} from './routes/lazyPages';
import './App.css';
import { MaterialIcon } from './components/MaterialIcon';
import { FireIcon } from './components/FireIcon';
import { NAVBAR_LABELS } from './constants/navbarLabels';

const GuidedTour = lazy(async () => {
  try {
    const module = await import('./components/GuidedTour');
    return { default: module.GuidedTour };
  } catch (error) {
    logger.error('guided-tour', 'chunk-load-failed', 'failed to load guided tour', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
    return { default: () => null };
  }
});

const UpdateNotification = lazy(async () => {
  try {
    return await import('./components/UpdateNotification');
  } catch (error) {
    logger.error('updater', 'chunk-load-failed', 'failed to load update notification', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
    return { default: () => null };
  }
});

// Context for policy modal
interface PolicyModalContextType {
  openPolicy: (type: PolicyType) => void;
  closePolicy: () => void;
}

export const PolicyModalContext = createContext<PolicyModalContextType>({
  openPolicy: () => {},
  closePolicy: () => {},
});

export const usePolicyModal = () => useContext(PolicyModalContext);

function Navigation({ accountName, showPortfolioBreakdown }: { accountName: string; showPortfolioBreakdown: boolean }) {
  const location = useLocation();
  const { t } = useTranslation();
  // Navbar labels are intentionally NOT routed through useTranslation — they
  // must always render in English. See src/constants/navbarLabels.ts (#233).
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const toggleMenu = () => setIsOpen(open => !open);
  const closeMenu = () => setIsOpen(false);

  useEffect(() => {
    closeMenu();
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <header className="app-header">
      <PreloadLink to="/" className="app-brand" onClick={closeMenu}>
        <span className="app-brand-mark"><FireIcon size={28} /></span>
        <h1>{t('app.title')}</h1>
      </PreloadLink>
    <nav className="app-nav" aria-label={NAVBAR_LABELS.ariaLabel}>
      <button
        ref={toggleRef}
        type="button"
        className="nav-toggle"
        onClick={toggleMenu}
        aria-label={NAVBAR_LABELS.toggle}
        aria-expanded={isOpen}
        aria-controls="app-navigation-links"
      >
        {isOpen ? <MaterialIcon name="close" /> : <MaterialIcon name="menu" />}
      </button>
      <div id="app-navigation-links" className={`nav-links ${isOpen ? 'open' : ''}`}>
        <PreloadLink
          to="/"
          className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/' ? 'page' : undefined}
        >
          <MaterialIcon name="home" className="nav-icon" /> {NAVBAR_LABELS.home}
        </PreloadLink>
        <PreloadLink
          to="/asset-allocation"
          className={`nav-link ${location.pathname === '/asset-allocation' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/asset-allocation' ? 'page' : undefined}
        >
          <MaterialIcon name="pie_chart" className="nav-icon" /> {NAVBAR_LABELS.assetAllocation}
        </PreloadLink>
        <PreloadLink
          to="/expense-tracker"
          className={`nav-link ${location.pathname === '/expense-tracker' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/expense-tracker' ? 'page' : undefined}
        >
          <MaterialIcon name="account_balance_wallet" className="nav-icon" /> {NAVBAR_LABELS.cashflow}
        </PreloadLink>
        <PreloadLink
          to="/net-worth-tracker"
          className={`nav-link ${location.pathname === '/net-worth-tracker' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/net-worth-tracker' ? 'page' : undefined}
        >
          <MaterialIcon name="paid" className="nav-icon" /> {NAVBAR_LABELS.netWorth}
        </PreloadLink>
        <PreloadLink
          to="/fire-calculator"
          className={`nav-link ${location.pathname === '/fire-calculator' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/fire-calculator' ? 'page' : undefined}
        >
          <MaterialIcon name="local_fire_department" className="nav-icon" /> {NAVBAR_LABELS.fireCalculator}
        </PreloadLink>
        <ToolsMenu onNavigate={closeMenu} showPortfolioBreakdown={showPortfolioBreakdown} />
      </div>
      <div className="nav-actions">
        <NotificationBell />
        <ProfileMenu accountName={accountName} />
      </div>
    </nav>
    </header>
  );
}

// Component to handle policy route and redirect to home while opening modal
function PolicyRouteRedirect({ policyType }: { policyType: PolicyType }) {
  const navigate = useNavigate();
  const { openPolicy } = usePolicyModal();
  
  useEffect(() => {
    // Open the policy modal
    openPolicy(policyType);
    // Navigate to home page
    navigate('/', { replace: true });
  }, [navigate, openPolicy, policyType]);
  
  return null;
}

// Bridges Electron menu IPC events into React Router navigation.
// Lives inside <Router> so it can use useNavigate().
function NavigateBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.fireTools : undefined;
    if (!bridge?.onNavigate) return;
    const unsubscribe = bridge.onNavigate((path: string) => {
      if (typeof path === 'string' && path.startsWith('/')) {
        void preloadRoute(path);
        startTransition(async () => {
          await navigate(path);
        });
      }
    });
    return () => {
      try { unsubscribe?.(); } catch { /* ignore */ }
    };
  }, [navigate]);
  return null;
}

function App() {
  // SPA lives under /demo on the web so the landing page can sit at the root.
  // The web basename mirrors Vite's BASE_URL (e.g. /<repo>/demo on GitHub
  // Pages), so it tracks the repo automatically. Electron detection covers
  // both packaged (file://) and unpackaged dev (http://) launches via the
  // preload bridge that only exists inside Electron.
  const isElectron =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'file:' || Boolean(window.fireTools));
  const basename = isElectron
    ? '/'
    : import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  const { t } = useTranslation();
  
  // Load settings from localStorage
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [uiPreferencesRevision, setUiPreferencesRevision] = useState(0);
  const shouldLoadTour = useMemo(
    () => uiPreferencesRevision > 0 && !loadTourCompleted(),
    [uiPreferencesRevision],
  );
  
  // Policy modal state
  const [policyModalType, setPolicyModalType] = useState<PolicyType | null>(null);

  // Sync optional UI prefs in the background so backend startup never blocks
  // the application shell. The tour and questionnaire prompt wait for the
  // sync, with local cookies used after the timeout.
  useEffect(() => {
    let cancelled = false;
    const TIMEOUT_MS = 800;
    const refreshPreferenceUi = () => {
      if (cancelled) return;
      startTransition(() => {
        setUiPreferencesRevision((revision) => revision + 1);
      });
    };
    const timer = setTimeout(() => {
      refreshPreferenceUi();
    }, TIMEOUT_MS);
    syncPreferencesFromBackend().finally(() => {
      if (cancelled) return;
      clearTimeout(timer);
      refreshPreferenceUi();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  
  const handleSettingsChange = useCallback((newSettings: UserSettings) => {
    setSettings(newSettings);
  }, []);
  
  const openPolicy = useCallback((type: PolicyType) => {
    setPolicyModalType(type);
  }, []);
  
  const closePolicy = useCallback(() => {
    setPolicyModalType(null);
  }, []);
  const policyContext = useMemo(() => ({ openPolicy, closePolicy }), [openPolicy, closePolicy]);

  return (
    <Router basename={basename}>
      <AuditLogProvider>
        <PolicyModalContext.Provider value={policyContext}>
        <div className={isElectron ? 'app app--electron' : 'app'}>
          <NavigateBridge />
          <DemoBanner />
          {isElectron && (
            <Suspense fallback={null}>
              <UpdateNotification />
            </Suspense>
          )}
          <a href="#main-content" className="skip-link" onClick={event => {
            event.preventDefault();
            const main = document.getElementById('main-content');
            if (main) {
              main.tabIndex = -1;
              main.focus();
            }
          }}>{t('app.skipToContent')}</a>

          <Navigation accountName={settings.accountName} showPortfolioBreakdown={settings.experimentalFeatures?.portfolioBreakdown ?? false} />

          <Suspense
            fallback={(
              <main className="route-loading" id="main-content" role="status" aria-live="polite">
                <MaterialIcon name="progress_activity" size="large" />
                <span>{t('common.loading')}</span>
              </main>
            )}
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/fire-calculator" element={<LazyFIRECalculatorPage />} />
              <Route path="/reverse-fire-calculator" element={<LazyReverseFIRECalculatorPage />} />
              <Route path="/monte-carlo" element={<LazyMonteCarloPage />} />
              <Route path="/investment-growth" element={<LazyInvestmentGrowthPage />} />
              <Route path="/withdrawal-rate" element={<LazyWithdrawalRatePage />} />
              <Route path="/asset-allocation" element={<LazyAssetAllocationPage />} />
              <Route path="/portfolio-backtest" element={<LazyPortfolioBacktestPage />} />
              <Route path="/portfolio-breakdown" element={settings.experimentalFeatures?.portfolioBreakdown ? <LazyPortfolioBreakdownPage /> : <NotFoundPage />} />
              <Route path="/expense-tracker" element={<LazyExpenseTrackerPage />} />
              <Route path="/net-worth-tracker" element={<LazyNetWorthTrackerPage />} />
              <Route path="/debt-payoff" element={<LazyDebtPayoffPage />} />
              <Route path="/questionnaire" element={<LazyQuestionnairePage />} />
              <Route path="/settings" element={<LazySettingsPage onSettingsChange={handleSettingsChange} />} />
              <Route path="/privacy-policy" element={<PolicyRouteRedirect policyType="privacy" />} />
              <Route path="/cookie-policy" element={<PolicyRouteRedirect policyType="cookie" />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>

          {!isElectron && (
            <footer className="app-footer">
              <p>
                {t('app.disclaimer')}
              </p>
              <div className="footer-links">
                <button 
                  type="button" 
                  className="footer-link-btn" 
                  onClick={() => openPolicy('privacy')}
                >
                  {t('app.privacyPolicy')}
                </button>
                <span className="footer-separator">•</span>
                <button 
                  type="button" 
                  className="footer-link-btn" 
                  onClick={() => openPolicy('cookie')}
                >
                  {t('app.cookiePolicy')}
                </button>
                <span className="footer-separator">•</span>
                <a href="https://github.com/fire-tools-inc/app" target="_blank" rel="noopener noreferrer">{t('app.github')}</a>
              </div>
            </footer>
          )}

          <PolicyModal 
            isOpen={policyModalType !== null} 
            onClose={closePolicy} 
            policyType={policyModalType || 'privacy'}
            onSwitchPolicy={openPolicy}
          />
          {!isElectron && <CookieConsent />}
          {shouldLoadTour && (
            <Suspense fallback={null}>
              <GuidedTour />
            </Suspense>
          )}
          {uiPreferencesRevision > 0 && (
            <QuestionnairePrompt preferencesRevision={uiPreferencesRevision} />
          )}
        </div>
      </PolicyModalContext.Provider>
      </AuditLogProvider>
    </Router>
  );
}

export default App;
