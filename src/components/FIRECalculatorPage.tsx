import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CalculatorInputs, CalculationResult } from '../types/calculator';
import { DEFAULT_INPUTS } from '../utils/defaults';
import { calculateFIRE } from '../utils/fireCalculator';
import { calculateFIREPortfolioData } from '../utils/allocationCalculator';
import { serializeInputsToURL, deserializeInputsFromURL, hasURLParams } from '../utils/urlParams';
import {
  saveFireCalculatorInputs,
  loadFireCalculatorInputs,
  clearAllData,
  loadAssetAllocation,
} from '../utils/cookieStorage';
import { exportFireCalculatorToCSV, importFireCalculatorFromCSV } from '../utils/csvExport';
import { loadSettings, saveSettings } from '../utils/cookieSettings';
import { createLazyComponent } from '../utils/lazyComponent';
import { useAuditLog } from '../contexts/AuditLogContext';
import { useDeferredRender } from '../hooks/useDeferredRender';
import { CalculatorInputsForm } from './CalculatorInputsForm';
import { FIREMetrics } from './FIREMetrics';
import { DataManagement } from './DataManagement';
import { MaterialIcon } from './MaterialIcon';
import { ChartLoadingFallback, ChartLoadFailure } from './ChartLoadingState';

const NetWorthChart = createLazyComponent(
  'net-worth-chart',
  () => import('./NetWorthChart').then((module) => module.NetWorthChart),
  () => <ChartLoadFailure />,
);

const IncomeExpensesChart = createLazyComponent(
  'income-expenses-chart',
  () => import('./IncomeExpensesChart').then((module) => module.IncomeExpensesChart),
  () => <ChartLoadFailure />,
);

export function FIRECalculatorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { logAuditEvent } = useAuditLog();

  const [inputs, setInputs] = useState<CalculatorInputs>(() => {
    if (hasURLParams(searchParams)) {
      return deserializeInputsFromURL(searchParams);
    }
    const saved = loadFireCalculatorInputs();
    if (saved) {
      return saved;
    }
    return DEFAULT_INPUTS;
  });

  const [result, setResult] = useState<CalculationResult | null>(null);
  const [zoomYears, setZoomYears] = useState<number | 'all'>(30);
  const [customZoomInput, setCustomZoomInput] = useState('');
  const [isPrivacyMode, setIsPrivacyMode] = useState(() => loadSettings().privacyMode);

  const togglePrivacyMode = () => {
    const newMode = !isPrivacyMode;
    setIsPrivacyMode(newMode);
    const settings = loadSettings();
    saveSettings({ ...settings, privacyMode: newMode });
  };

  const assetAllocationData = useMemo(() => {
    const saved = loadAssetAllocation();
    if (!saved.assets || saved.assets.length === 0) {
      return undefined;
    }
    return calculateFIREPortfolioData(saved.assets);
  }, []);

  useEffect(() => {
    const params = serializeInputsToURL(inputs);
    setSearchParams(params, { replace: true });
  }, [inputs, setSearchParams]);

  useEffect(() => {
    saveFireCalculatorInputs(inputs);
  }, [inputs]);

  useEffect(() => {
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
    setResult(calculateFIRE(effectiveInputs));
  }, [inputs, assetAllocationData]);

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
  const renderCharts = useDeferredRender(Boolean(result && !hasValidationErrors));

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

  const handleImportCSV = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const csv = loadEvent.target?.result as string;
        const importedInputs = importFireCalculatorFromCSV(csv);
        setInputs(importedInputs);
        logAuditEvent('IMPORT_DATA', { dataset: 'fire-calculator', format: 'csv' });
      } catch (error) {
        alert(`Error importing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleResetData = () => {
    if (confirm('Are you sure you want to reset all data? This will clear all saved data from cookies and reset to defaults.')) {
      clearAllData();
      setInputs(DEFAULT_INPUTS);
    }
  };

  const expandAndScrollTo = (sectionId: string) => {
    setSidebarCollapsed(false);
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
              inputs={inputs}
              onLoadScenario={setInputs}
              isPrivacyMode={isPrivacyMode}
              onTogglePrivacyMode={togglePrivacyMode}
            />

            <div className="charts-section" data-tour="charts-section">
              {renderCharts ? (
                <Suspense fallback={<ChartLoadingFallback />}>
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
                </Suspense>
              ) : (
                <ChartLoadingFallback />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
