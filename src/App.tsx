import { BrowserRouter as Router, Routes, Route, Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { CalculatorInputs, CalculationResult } from './types/calculator';
import { DEFAULT_INPUTS } from './utils/defaults';
import { calculateFIRE } from './utils/fireCalculator';
import { calculateFIREPortfolioData } from './utils/allocationCalculator';
import { CalculatorInputsForm } from './components/CalculatorInputsForm';
import { IncomeExpensesChart } from './components/IncomeExpensesChart';
import { NetWorthChart } from './components/NetWorthChart';
import { FIREMetrics } from './components/FIREMetrics';
import { MonteCarloPage } from './components/MonteCarloPage';
import { AssetAllocationPage } from './components/AssetAllocationPage';
import { PortfolioBreakdownPage } from './components/PortfolioBreakdownPage';
import { ExpenseTrackerPage } from './components/ExpenseTrackerPage';
import { NetWorthTrackerPage } from './components/NetWorthTrackerPage';
import { HomePage } from './components/HomePage';
import { DataManagement } from './components/DataManagement';
import { ProfileMenu } from './components/ProfileMenu';
import { NotificationBell } from './components/NotificationBell';
import { SettingsPage } from './components/SettingsPage';
import { CookieConsent } from './components/CookieConsent';
import { GuidedTour } from './components/GuidedTour';
import { NotFoundPage } from './components/NotFoundPage';
import { QuestionnairePage } from './components/QuestionnairePage';
import { QuestionnairePrompt } from './components/QuestionnairePrompt';
import { PolicyModal, PolicyType } from './components/PolicyModal';
import { serializeInputsToURL, deserializeInputsFromURL, hasURLParams } from './utils/urlParams';
import { saveFireCalculatorInputs, loadFireCalculatorInputs, clearAllData, loadAssetAllocation } from './utils/cookieStorage';
import { exportFireCalculatorToCSV, importFireCalculatorFromCSV } from './utils/csvExport';
import { loadSettings, saveSettings, type UserSettings } from './utils/cookieSettings';
import './App.css';
import './components/AssetAllocationManager.css';
import './components/ExpenseTrackerPage.css';
import './components/NetWorthTrackerPage.css';
import './components/GuidedTour.css';
import './components/NotificationBell.css';
import { MaterialIcon } from './components/MaterialIcon';
import { FireIcon } from './components/FireIcon';

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
  const [isOpen, setIsOpen] = useState(false);
  
  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);
  
  return (
    <nav className="app-nav" aria-label="Main navigation">
      <button 
        className="nav-toggle" 
        onClick={toggleMenu} 
        aria-label="Toggle navigation menu"
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
          <MaterialIcon name="home" className="nav-icon" /> Home
        </Link>
        <Link 
          to="/asset-allocation" 
          className={`nav-link ${location.pathname === '/asset-allocation' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/asset-allocation' ? 'page' : undefined}
        >
          <MaterialIcon name="pie_chart" className="nav-icon" /> Asset Allocation
        </Link>
        {showPortfolioBreakdown && (
          <Link 
            to="/portfolio-breakdown" 
            className={`nav-link ${location.pathname === '/portfolio-breakdown' ? 'active' : ''}`}
            onClick={closeMenu}
            aria-current={location.pathname === '/portfolio-breakdown' ? 'page' : undefined}
          >
            <MaterialIcon name="donut_large" className="nav-icon" /> Portfolio Breakdown
          </Link>
        )}
        <Link 
          to="/expense-tracker" 
          className={`nav-link ${location.pathname === '/expense-tracker' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/expense-tracker' ? 'page' : undefined}
        >
          <MaterialIcon name="account_balance_wallet" className="nav-icon" /> Cashflow
        </Link>
        <Link 
          to="/net-worth-tracker" 
          className={`nav-link ${location.pathname === '/net-worth-tracker' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/net-worth-tracker' ? 'page' : undefined}
        >
          <MaterialIcon name="trending_up" className="nav-icon" /> Net Worth
        </Link>
        <Link 
          to="/fire-calculator" 
          className={`nav-link ${location.pathname === '/fire-calculator' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/fire-calculator' ? 'page' : undefined}
        >
          <MaterialIcon name="local_fire_department" className="nav-icon" /> FIRE Calculator
        </Link>
        <Link 
          to="/monte-carlo" 
          className={`nav-link ${location.pathname === '/monte-carlo' ? 'active' : ''}`}
          onClick={closeMenu}
          aria-current={location.pathname === '/monte-carlo' ? 'page' : undefined}
        >
          <MaterialIcon name="casino" className="nav-icon" /> Monte Carlo
        </Link>
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

function App() {
  // Use base path only in production (for GitHub Pages), not in local development
  const basename = import.meta.env.MODE === 'production' ? '/fire-tools' : '/';
  
  // Load settings from localStorage
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  
  // Policy modal state
  const [policyModalType, setPolicyModalType] = useState<PolicyType | null>(null);
  
  const handleSettingsChange = (newSettings: UserSettings) => {
    setSettings(newSettings);
  };
  
  const openPolicy = (type: PolicyType) => {
    setPolicyModalType(type);
  };
  
  const closePolicy = () => {
    setPolicyModalType(null);
  };
  
  return (
    <Router basename={basename}>
      <PolicyModalContext.Provider value={{ openPolicy, closePolicy }}>
        <div className="app">
          <a href="#main-content" className="skip-link">Skip to main content</a>
          
          <header className="app-header">
            <FireIcon size={96} className="header-fire-icon" />
            <h1>Fire Tools</h1>
            <p>Rocket fuel for your financial planning</p>
          </header>

          <Navigation accountName={settings.accountName} showPortfolioBreakdown={settings.experimentalFeatures?.portfolioBreakdown ?? false} />

          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/fire-calculator" element={<FIRECalculatorPage />} />
            <Route path="/monte-carlo" element={<MonteCarloPage />} />
            <Route path="/asset-allocation" element={<AssetAllocationPage />} />
            <Route path="/portfolio-breakdown" element={settings.experimentalFeatures?.portfolioBreakdown ? <PortfolioBreakdownPage /> : <NotFoundPage />} />
            <Route path="/expense-tracker" element={<ExpenseTrackerPage />} />
            <Route path="/net-worth-tracker" element={<NetWorthTrackerPage />} />
            <Route path="/questionnaire" element={<QuestionnairePage />} />
            <Route path="/settings" element={<SettingsPage onSettingsChange={handleSettingsChange} />} />
            <Route path="/privacy-policy" element={<PolicyRouteRedirect policyType="privacy" />} />
            <Route path="/cookie-policy" element={<PolicyRouteRedirect policyType="cookie" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>

          <footer className="app-footer">
            <p>
              Fire Tools - Disclaimer: This is for educational purposes only. 
              Market data is provided as an indication only and may be delayed or inaccurate.
              Consult with a financial advisor for professional advice.
            </p>
            <div className="footer-links">
              <button 
                type="button" 
                className="footer-link-btn" 
                onClick={() => openPolicy('privacy')}
              >
                Privacy Policy
              </button>
              <span className="footer-separator">•</span>
              <button 
                type="button" 
                className="footer-link-btn" 
                onClick={() => openPolicy('cookie')}
              >
                Cookie Policy
              </button>
              <span className="footer-separator">•</span>
              <a href="https://github.com/mbianchidev/fire-tools" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </footer>

          <PolicyModal 
            isOpen={policyModalType !== null} 
            onClose={closePolicy} 
            policyType={policyModalType || 'privacy'}
            onSwitchPolicy={openPolicy}
          />
          <CookieConsent />
          <GuidedTour />
          <QuestionnairePrompt />
        </div>
      </PolicyModalContext.Provider>
    </Router>
  );
}

export default App;
