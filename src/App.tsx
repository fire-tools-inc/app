import { BrowserRouter, HashRouter, Routes, Route, Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
// Use HashRouter under file:// (Electron) so deep links work without a server.
const Router = typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
import { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { CalculatorInputs, CalculationResult } from './types/calculator';
import { DEFAULT_INPUTS } from './utils/defaults';
import { calculateFIRE } from './utils/fireCalculator';
import { calculateFIREPortfolioData } from './utils/allocationCalculator';
import { CalculatorInputsForm } from './components/CalculatorInputsForm';
import { IncomeExpensesChart } from './components/IncomeExpensesChart';
import { NetWorthChart } from './components/NetWorthChart';
import { FIREMetrics } from './components/FIREMetrics';
import { MonteCarloPage } from './components/MonteCarloPage';
import { ReverseFIRECalculatorPage } from './components/ReverseFIRECalculatorPage';
import { InvestmentGrowthPage } from './components/InvestmentGrowthPage';
import { WithdrawalRatePage } from './components/WithdrawalRatePage';
import { AssetAllocationPage } from './components/AssetAllocationPage';
import { PortfolioBacktestPage } from './components/PortfolioBacktestPage';
import { PortfolioBreakdownPage } from './components/PortfolioBreakdownPage';
import { ExpenseTrackerPage } from './components/ExpenseTrackerPage';
import { NetWorthTrackerPage } from './components/NetWorthTrackerPage';
import { DebtPayoffPage } from './components/DebtPayoffPage';
import { HomePage } from './components/HomePage';
import { DataManagement } from './components/DataManagement';
import { ProfileMenu } from './components/ProfileMenu';
import { ToolsMenu } from './components/ToolsMenu';
import { NotificationBell } from './components/NotificationBell';
import { SettingsPage } from './components/SettingsPage';
import { CookieConsent } from './components/CookieConsent';
import { DemoBanner } from './components/DemoBanner';
import UpdateNotification from './components/UpdateNotification';
import { GuidedTour } from './components/GuidedTour';
import { NotFoundPage } from './components/NotFoundPage';
import { QuestionnairePage } from './components/QuestionnairePage';
import { QuestionnairePrompt } from './components/QuestionnairePrompt';
import { PolicyModal, PolicyType } from './components/PolicyModal';
import { AuditLogProvider } from './contexts/AuditLogContext';
import { useAuditLog } from './contexts/AuditLogContext';
import { serializeInputsToURL, deserializeInputsFromURL, hasURLParams } from './utils/urlParams';
import { saveFireCalculatorInputs, loadFireCalculatorInputs, clearAllData, loadAssetAllocation } from './utils/cookieStorage';
import { exportFireCalculatorToCSV, importFireCalculatorFromCSV } from './utils/csvExport';
import { loadSettings, saveSettings, type UserSettings } from './utils/cookieSettings';
import { syncPreferencesFromBackend } from './utils/uiPreferencesSync';
import './App.css';
import './components/AssetAllocationManager.css';
import './components/ExpenseTrackerPage.css';
import './components/NetWorthTrackerPage.css';
import './components/GuidedTour.css';
import './components/NotificationBell.css';
import { MaterialIcon } from './components/MaterialIcon';
import { FireIcon } from './components/FireIcon';
import { NAVBAR_LABELS } from './constants/navbarLabels';

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
  // Navbar labels are intentionally NOT routed through useTranslation — they
  // must always render in English. See src/constants/navbarLabels.ts (#233).
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <nav className="app-nav" aria-label={NAVBAR_LABELS.ariaLabel}>
      <button
        className="nav-toggle"
        onClick={toggleMenu}
        aria-label={NAVBAR_LABELS.toggle}
        aria-expanded={isOpen}
      >
        {isOpen ? <MaterialIcon name="close" /> : <MaterialIcon name="menu" />}
      </button>
      <div className={`nav-links ${isOpen ? 'open' : ''}`}>
        <Link
          to="/"
          className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/' ? 'page' : undefined}
        >
          <MaterialIcon name="home" className="nav-icon" /> {NAVBAR_LABELS.home}
        </Link>
        <Link
          to="/asset-allocation"
          className={`nav-link ${location.pathname === '/asset-allocation' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/asset-allocation' ? 'page' : undefined}
        >
          <MaterialIcon name="pie_chart" className="nav-icon" /> {NAVBAR_LABELS.assetAllocation}
        </Link>
        <Link
          to="/expense-tracker"
          className={`nav-link ${location.pathname === '/expense-tracker' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/expense-tracker' ? 'page' : undefined}
        >
          <MaterialIcon name="account_balance_wallet" className="nav-icon" /> {NAVBAR_LABELS.cashflow}
        </Link>
        <Link
          to="/net-worth-tracker"
          className={`nav-link ${location.pathname === '/net-worth-tracker' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/net-worth-tracker' ? 'page' : undefined}
        >
          <MaterialIcon name="paid" className="nav-icon" /> {NAVBAR_LABELS.netWorth}
        </Link>
        <Link
          to="/fire-calculator"
          className={`nav-link ${location.pathname === '/fire-calculator' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/fire-calculator' ? 'page' : undefined}
        >
          <MaterialIcon name="local_fire_department" className="nav-icon" /> {NAVBAR_LABELS.fireCalculator}
        </Link>
        <ToolsMenu onNavigate={closeMenu} showPortfolioBreakdown={showPortfolioBreakdown} />
      </div>
      <div className="nav-actions">
        <NotificationBell />
        <ProfileMenu accountName={accountName} />
      </div>
    </nav>
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

function FIRECalculatorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { logAuditEvent } = useAuditLog();
  
  // Initialize state from URL if parameters exist, otherwise from localStorage, then defaults
  const [inputs, setInputs] = useState<CalculatorInputs>(() => {
    // Priority 1: URL parameters (for sharing)
    if (hasURLParams(searchParams)) {
      return deserializeInputsFromURL(searchParams);
    }
    // Priority 2: localStorage (for persistence)
    const saved = loadFireCalculatorInputs();
    if (saved) {
      return saved;
    }
    // Priority 3: defaults
    return DEFAULT_INPUTS;
  });
  
  const [result, setResult] = useState<CalculationResult | null>(null);
  
  // Shared zoom state for both charts (default to 30 years)
  const [zoomYears, setZoomYears] = useState<number | 'all'>(30);
  const [customZoomInput, setCustomZoomInput] = useState<string>('');
  
  // Privacy mode state (loaded from settings, toggleable on page)
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    const settings = loadSettings();
    return settings.privacyMode;
  });
  
  // Toggle privacy mode and save to settings
  const togglePrivacyMode = () => {
    const newMode = !isPrivacyMode;
    setIsPrivacyMode(newMode);
    const settings = loadSettings();
    saveSettings({ ...settings, privacyMode: newMode });
  };

  // Load asset allocation data for use in calculator (filtered by FIRE settings)
  const assetAllocationData = useMemo(() => {
    const saved = loadAssetAllocation();
    if (!saved.assets || saved.assets.length === 0) {
      return undefined;
    }
    return calculateFIREPortfolioData(saved.assets);
  }, []);

  // Update URL when inputs change
  useEffect(() => {
    const params = serializeInputsToURL(inputs);
    setSearchParams(params, { replace: true });
  }, [inputs, setSearchParams]);

  // Auto-save to localStorage when inputs change
  useEffect(() => {
    saveFireCalculatorInputs(inputs);
  }, [inputs]);

  // Calculate FIRE results, using asset allocation data if enabled
  useEffect(() => {
    // If using asset allocation value, override the inputs with asset allocation data
    let effectiveInputs = inputs;
    if (inputs.useAssetAllocationValue && assetAllocationData) {
      effectiveInputs = {
        ...inputs,
        initialSavings: assetAllocationData.totalValue,
        stocksPercent: assetAllocationData.stocksPercent,
        bondsPercent: assetAllocationData.bondsPercent,
        cashPercent: assetAllocationData.cashPercent,
      };
    }
    const calculationResult = calculateFIRE(effectiveInputs);
    setResult(calculationResult);
  }, [inputs, assetAllocationData]);

  // Audit the FIRE calculation. The calc runs automatically on every input
  // change, so we debounce and skip the initial (page-load) computation to
  // avoid logging restores/keystrokes as discrete user actions.
  const calcAuditInitialised = useRef(false);
  useEffect(() => {
    if (!result) return;
    if (!calcAuditInitialised.current) {
      calcAuditInitialised.current = true;
      return;
    }
    const handle = setTimeout(() => {
      logAuditEvent('RUN_CALCULATION', {
        yearsToFIRE: result.yearsToFIRE,
        fireTarget: result.fireTarget,
        fireType: result.fireType,
      });
    }, 1500);
    return () => clearTimeout(handle);
  }, [result, logAuditEvent]);

  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - inputs.yearOfBirth;
  
  const hasValidationErrors = result?.validationErrors && result.validationErrors.length > 0;

  const handleExportCSV = () => {
    const csv = exportFireCalculatorToCSV(inputs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fire-calculator-data-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    logAuditEvent('EXPORT_DATA', { dataset: 'fire-calculator', format: 'csv' });
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const importedInputs = importFireCalculatorFromCSV(csv);
        setInputs(importedInputs);
        logAuditEvent('IMPORT_DATA', { dataset: 'fire-calculator', format: 'csv' });
      } catch (error) {
        alert(`Error importing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    // Reset the input value so the same file can be selected again
    event.target.value = '';
  };

  const handleResetData = () => {
    if (confirm('Are you sure you want to reset all data? This will clear all saved data from cookies and reset to defaults.')) {
      clearAllData();
      setInputs(DEFAULT_INPUTS);
    }
  };

  // Expand sidebar and scroll to a specific section
  const expandAndScrollTo = (sectionId: string) => {
    setSidebarCollapsed(false);
    // Wait for the sidebar to expand and content to render
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  return (
    <div className="app-container">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="Calculator inputs">
        <button 
          className="sidebar-toggle-btn" 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
        >
          <MaterialIcon name={sidebarCollapsed ? 'chevron_right' : 'chevron_left'} />
        </button>
        
        {/* Collapsed state icons */}
        <div className="sidebar-collapsed-icons">
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-data-management')}
            title="Data Management"
            aria-label="Expand to manage data"
          >
            <MaterialIcon name="save" />
          </button>
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-initial-values')}
            title="Initial Values"
            aria-label="Expand to edit Initial Values"
          >
            <MaterialIcon name="savings" />
          </button>
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-asset-allocation')}
            title="Asset Allocation"
            aria-label="Expand to edit Asset Allocation"
          >
            <MaterialIcon name="pie_chart" />
          </button>
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-income')}
            title="Income"
            aria-label="Expand to edit Income"
          >
            <MaterialIcon name="payments" />
          </button>
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-pension')}
            title="Pension"
            aria-label="Expand to edit Pension"
          >
            <MaterialIcon name="account_balance" />
          </button>
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-expenses')}
            title="Expenses & Savings"
            aria-label="Expand to edit Expenses & Savings"
          >
            <MaterialIcon name="shopping_cart" />
          </button>
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-fire-params')}
            title="FIRE Parameters"
            aria-label="Expand to edit FIRE Parameters"
          >
            <MaterialIcon name="gps_fixed" />
          </button>
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-expected-returns')}
            title="Expected Returns"
            aria-label="Expand to edit Expected Returns"
          >
            <MaterialIcon name="trending_up" />
          </button>
          <button 
            className="sidebar-icon-btn" 
            onClick={() => expandAndScrollTo('section-options')}
            title="Options"
            aria-label="Expand to edit Options"
          >
            <MaterialIcon name="settings" />
          </button>
        </div>
        
        {!sidebarCollapsed && (
          <>
            <DataManagement
              onExport={handleExportCSV}
              onImport={handleImportCSV}
              onReset={handleResetData}
              defaultOpen={false}
            />
            
            <CalculatorInputsForm 
              inputs={inputs} 
              onChange={setInputs} 
              assetAllocationData={assetAllocationData}
              isPrivacyMode={isPrivacyMode}
            />
          </>
        )}
      </aside>

      <main className="main-content">
        {hasValidationErrors && (
          <div className="validation-error-banner" role="alert" aria-live="polite">
            <strong><MaterialIcon name="warning" /> Validation Error</strong>
            {result.validationErrors?.map((error, index) => (
              <div key={index} className="validation-error-message">{error}</div>
            ))}
          </div>
        )}
        
        {result && !hasValidationErrors && (
          <>
            <FIREMetrics 
              result={result} 
              currentAge={currentAge} 
              zoomYears={zoomYears} 
              isPrivacyMode={isPrivacyMode}
              onTogglePrivacyMode={togglePrivacyMode}
            />
            
            <div className="charts-section" data-tour="charts-section">
              <NetWorthChart 
                projections={result.projections} 
                fireTarget={result.fireTarget} 
                currentAge={currentAge}
                zoomYears={zoomYears}
                onZoomChange={setZoomYears}
                customZoomInput={customZoomInput}
                onCustomZoomInputChange={setCustomZoomInput}
                isPrivacyMode={isPrivacyMode}
              />
              <IncomeExpensesChart 
                projections={result.projections} 
                currentAge={currentAge}
                zoomYears={zoomYears}
                onZoomChange={setZoomYears}
                customZoomInput={customZoomInput}
                onCustomZoomInputChange={setCustomZoomInput}
                isPrivacyMode={isPrivacyMode}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
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
        navigate(path);
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
  
  // Policy modal state
  const [policyModalType, setPolicyModalType] = useState<PolicyType | null>(null);

  // Mirror persisted UI prefs (tour, banner, questionnaire prompt) from the
  // backend into local cookies before children mount, so synchronous
  // load*() helpers see DB-backed values on first render.
  // In pure-web mode getApiBaseUrl() resolves null and this is a no-op.
  const [prefsReady, setPrefsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const TIMEOUT_MS = 800;
    const timer = setTimeout(() => {
      if (!cancelled) setPrefsReady(true);
    }, TIMEOUT_MS);
    syncPreferencesFromBackend().finally(() => {
      if (cancelled) return;
      clearTimeout(timer);
      setPrefsReady(true);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  
  const handleSettingsChange = (newSettings: UserSettings) => {
    setSettings(newSettings);
  };
  
  const openPolicy = (type: PolicyType) => {
    setPolicyModalType(type);
  };
  
  const closePolicy = () => {
    setPolicyModalType(null);
  };

  if (!prefsReady) {
    return null;
  }

  return (
    <Router basename={basename}>
      <AuditLogProvider>
        <PolicyModalContext.Provider value={{ openPolicy, closePolicy }}>
        <div className={isElectron ? 'app app--electron' : 'app'}>
          <NavigateBridge />
          <DemoBanner />
          {isElectron && <UpdateNotification />}
          <a href="#main-content" className="skip-link">{t('app.skipToContent')}</a>
          
          <header className="app-header">
            <FireIcon size={96} className="header-fire-icon" />
            <h1>{t('app.title')}</h1>
            <p>{t('app.tagline')}</p>
          </header>

          <Navigation accountName={settings.accountName} showPortfolioBreakdown={settings.experimentalFeatures?.portfolioBreakdown ?? false} />

          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/fire-calculator" element={<FIRECalculatorPage />} />
            <Route path="/reverse-fire-calculator" element={<ReverseFIRECalculatorPage />} />
            <Route path="/monte-carlo" element={<MonteCarloPage />} />
            <Route path="/investment-growth" element={<InvestmentGrowthPage />} />
            <Route path="/withdrawal-rate" element={<WithdrawalRatePage />} />
            <Route path="/asset-allocation" element={<AssetAllocationPage />} />
            <Route path="/portfolio-backtest" element={<PortfolioBacktestPage />} />
            <Route path="/portfolio-breakdown" element={settings.experimentalFeatures?.portfolioBreakdown ? <PortfolioBreakdownPage /> : <NotFoundPage />} />
            <Route path="/expense-tracker" element={<ExpenseTrackerPage />} />
            <Route path="/net-worth-tracker" element={<NetWorthTrackerPage />} />
            <Route path="/debt-payoff" element={<DebtPayoffPage />} />
            <Route path="/questionnaire" element={<QuestionnairePage />} />
            <Route path="/settings" element={<SettingsPage onSettingsChange={handleSettingsChange} />} />
            <Route path="/privacy-policy" element={<PolicyRouteRedirect policyType="privacy" />} />
            <Route path="/cookie-policy" element={<PolicyRouteRedirect policyType="cookie" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>

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
          <GuidedTour />
          <QuestionnairePrompt />
        </div>
      </PolicyModalContext.Provider>
      </AuditLogProvider>
    </Router>
  );
}

export default App;
