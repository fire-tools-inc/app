import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { CalculationResult, CalculatorInputs } from '../types/calculator';
import { DEFAULT_INPUTS } from '../utils/defaults';
import { calculateFIRE, getEffectiveInputs } from '../utils/fireCalculator';
import { loadFireCalculatorInputs, loadAssetAllocation } from '../utils/cookieStorage';
import { calculateFIREPortfolioData } from '../utils/allocationCalculator';
import { MaterialIcon } from './MaterialIcon';
import { MonteCarloSimulator } from './MonteCarloSimulator';

export const MonteCarloPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  
  // Load inputs from location state, cookies, or defaults.
  // Uses location.key as dependency to reload inputs when navigating back to this page.
  // ESLint warning suppressed because location.key is intentionally used instead of
  // location.state?.inputs - we want to reload from cookies on every navigation,
  // not just when location.state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseInputs = useMemo<CalculatorInputs>(() => {
    return location.state?.inputs || loadFireCalculatorInputs() || DEFAULT_INPUTS;
  }, [location.key]);
  
  const [result, setResult] = useState<CalculationResult | null>(null);

  // Load asset allocation data for use when useAssetAllocationValue is enabled.
  // Uses location.key as dependency to reload data when navigating back to this page.
  // ESLint warning suppressed because location.key is intentionally used to trigger
  // reload from cookies on every navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const assetAllocationData = useMemo(() => {
    const saved = loadAssetAllocation();
    if (!saved.assets || saved.assets.length === 0) {
      return undefined;
    }
    return calculateFIREPortfolioData(saved.assets);
  }, [location.key]);

  // Apply asset allocation data if useAssetAllocationValue is enabled,
  // and apply expense tracker values if those options are enabled
  const inputs: CalculatorInputs = useMemo(() => {
    let effectiveInputs = baseInputs;
    
    // Apply asset allocation overrides if enabled
    if (baseInputs.useAssetAllocationValue && assetAllocationData) {
      effectiveInputs = {
        ...effectiveInputs,
        initialSavings: assetAllocationData.totalValue,
        stocksPercent: assetAllocationData.stocksPercent,
        bondsPercent: assetAllocationData.bondsPercent,
        cashPercent: assetAllocationData.cashPercent,
      };
    }
    
    // Apply expense tracker values (income and expenses) if enabled
    // This uses getEffectiveInputs which calculates values from expense tracker data
    effectiveInputs = getEffectiveInputs(effectiveInputs);
    
    return effectiveInputs;
  }, [baseInputs, assetAllocationData]);

  useEffect(() => {
    const calculationResult = calculateFIRE(inputs);
    setResult(calculationResult);
  }, [inputs]);

  const hasValidationErrors = result?.validationErrors && result.validationErrors.length > 0;

  return (
    <div className="app-container monte-carlo-container">
      <main className="main-content" id="main-content">
        <header className="page-header">
          <h2><MaterialIcon name="casino" className="page-header-icon" /> {t('monteCarlo.pageTitle')}</h2>
          <p className="page-description">
            {t('monteCarlo.pageDescription')}
          </p>
        </header>

        {hasValidationErrors && (
          <div className="validation-error-banner" role="alert" aria-live="polite">
            <strong><MaterialIcon name="warning" /> {t('monteCarlo.validationError')}</strong>
            {result.validationErrors?.map((error, index) => (
              <div key={index} className="validation-error-message">{error}</div>
            ))}
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              {t('monteCarlo.fixValidationReturn')}
            </p>
          </div>
        )}

        {result && !hasValidationErrors && (
          <MonteCarloSimulator inputs={inputs} />
        )}
      </main>
    </div>
  );
};
