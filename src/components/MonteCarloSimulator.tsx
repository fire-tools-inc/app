import { useState, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CalculatorInputs, MonteCarloInputs, MonteCarloResultWithLogs, SimulationLogEntry, MonteCarloFixedParameters } from '../types/calculator';
import { runMonteCarloSimulationWithLogs } from '../utils/monteCarlo';
import { loadSettings, saveSettings } from '../utils/cookieSettings';
import { NumberInput } from './NumberInput';
import { MonteCarloChart } from './MonteCarloChart';
import { MonteCarloLogs } from './MonteCarloLogs';
import { MaterialIcon } from './MaterialIcon';
import { PrivacyBlur } from './PrivacyBlur';
import { formatDisplayCurrency, formatDisplayPercent } from '../utils/numberFormatter';

interface MonteCarloSimulatorProps {
  inputs: CalculatorInputs;
}

interface ValidationErrors {
  numSimulations?: string;
  stockVolatility?: string;
  bondVolatility?: string;
  blackSwanProbability?: string;
  blackSwanImpact?: string;
}

// Format currency for display (using centralized formatter)
const formatCurrency = (value: number, currency: string): string => {
  return formatDisplayCurrency(value, currency);
};

export const MonteCarloSimulator: React.FC<MonteCarloSimulatorProps> = ({ inputs }) => {
  const { t } = useTranslation();
  // Load default currency from settings once at component level
  const defaultCurrency = useMemo(() => {
    const settings = loadSettings();
    return settings.currencySettings.defaultCurrency;
  }, []);
  
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
  
  const [mcInputs, setMcInputs] = useState<MonteCarloInputs>({
    numSimulations: 1000,
    stockVolatility: 15,
    bondVolatility: 5,
    blackSwanProbability: 2,
    blackSwanImpact: -40,
  });

  const [result, setResult] = useState<MonteCarloResultWithLogs | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isBaseDataExpanded, setIsBaseDataExpanded] = useState(true);
  
  // Simulation logs - stored in state so they reset on page refresh/navigation
  const [simulationLogs, setSimulationLogs] = useState<SimulationLogEntry[]>([]);
  const [fixedParameters, setFixedParameters] = useState<MonteCarloFixedParameters | null>(null);

  // Calculate derived values for display
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - inputs.yearOfBirth; // Approximate age based on year of birth
  const fireTarget = inputs.fireAnnualExpenses / (inputs.desiredWithdrawalRate / 100);

  // Validation logic
  const validationErrors = useMemo((): ValidationErrors => {
    const errors: ValidationErrors = {};
    
    // Number of simulations: must be between 1000 and 100000
    if (mcInputs.numSimulations < 1000) {
      errors.numSimulations = t('monteCarlo.validation.numSimulationsMin');
    } else if (mcInputs.numSimulations > 100000) {
      errors.numSimulations = t('monteCarlo.validation.numSimulationsMax');
    }
    
    // Stock volatility: must be positive (> 0)
    if (mcInputs.stockVolatility <= 0) {
      errors.stockVolatility = t('monteCarlo.validation.stockVolatilityMin');
    }
    
    // Bond volatility: must be positive and less than stock volatility
    if (mcInputs.bondVolatility <= 0) {
      errors.bondVolatility = t('monteCarlo.validation.bondVolatilityMin');
    } else if (mcInputs.bondVolatility >= mcInputs.stockVolatility) {
      errors.bondVolatility = t('monteCarlo.validation.bondVolatilityMax', { value: mcInputs.stockVolatility });
    }
    
    // Black swan probability: must be at least 0.1%
    if (mcInputs.blackSwanProbability < 0.1) {
      errors.blackSwanProbability = t('monteCarlo.validation.blackSwanProbMin');
    }
    
    // Black swan impact: must be between -50% and 0% (0% means no impact, -50% is maximum loss allowed)
    if (mcInputs.blackSwanImpact > 0) {
      errors.blackSwanImpact = t('monteCarlo.validation.blackSwanImpactPositive');
    } else if (mcInputs.blackSwanImpact < -50) {
      errors.blackSwanImpact = t('monteCarlo.validation.blackSwanImpactMin');
    }
    
    return errors;
  }, [mcInputs]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  const handleInputChange = (field: keyof MonteCarloInputs, value: number) => {
    setMcInputs({ ...mcInputs, [field]: value });
  };

  const runSimulation = () => {
    if (hasErrors) return;
    
    setIsRunning(true);
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const mcResult = runMonteCarloSimulationWithLogs(inputs, mcInputs);
      setResult(mcResult);
      // Append new logs to existing logs (logs reset on page refresh/navigation)
      setSimulationLogs(prevLogs => [...prevLogs, ...mcResult.logs]);
      setFixedParameters(mcResult.fixedParameters);
      setIsRunning(false);
    }, 100);
  };

  return (
    <section className="monte-carlo-section" aria-labelledby="monte-carlo-heading">
      <div data-tour="monte-carlo-overview">
        <h2 id="monte-carlo-heading">
          <MaterialIcon name="casino" className="page-header-icon" /> {t('monteCarlo.pageTitle')}
          <button 
            className="privacy-eye-btn"
            onClick={togglePrivacyMode}
            title={isPrivacyMode ? t('common.showValues') : t('common.hideValues')}
            aria-pressed={isPrivacyMode}
            style={{ marginLeft: '0.5rem' }}
          >
            <MaterialIcon name={isPrivacyMode ? 'visibility_off' : 'visibility'} size="small" />
          </button>
        </h2>
        <p className="section-description">
          {t('monteCarlo.sectionDescription')}
        </p>
      </div>

      {/* Base Data Section - Non-editable simulation parameters */}
      <div className="mc-base-data-section" data-tour="monte-carlo-base-data">
        <button
          type="button"
          className="mc-base-data-toggle"
          onClick={() => setIsBaseDataExpanded(!isBaseDataExpanded)}
          aria-expanded={isBaseDataExpanded}
          aria-controls="mc-base-data-content"
        >
          <span className="mc-base-data-title">
            <MaterialIcon name="bar_chart" /> {t('monteCarlo.baseData.title')}
          </span>
          <span className="mc-base-data-subtitle">
            {t('monteCarlo.baseData.subtitle')}
          </span>
          <span className="collapse-icon" aria-hidden="true">{isBaseDataExpanded ? '▼' : '▶'}</span>
        </button>
        
        {isBaseDataExpanded && (
          <div id="mc-base-data-content" className="mc-base-data-content">
            <div className="mc-base-data-grid">
              {/* Financial Position */}
              <div className="mc-data-group">
                <h4 className="mc-data-group-title">{t('monteCarlo.baseData.financialPosition')}</h4>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.initialPortfolio')}</span>
                  <span className="mc-data-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(inputs.initialSavings, defaultCurrency)}</PrivacyBlur></span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.fireTarget')}</span>
                  <span className="mc-data-value highlight"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(fireTarget, defaultCurrency)}</PrivacyBlur></span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.annualIncome')}</span>
                  <span className="mc-data-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(inputs.annualLaborIncome, defaultCurrency)}</PrivacyBlur></span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.savingsRate')}</span>
                  <span className="mc-data-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(inputs.savingsRate)}</PrivacyBlur></span>
                </div>
              </div>

              {/* Asset Allocation */}
              <div className="mc-data-group">
                <h4 className="mc-data-group-title">{t('monteCarlo.baseData.assetAllocation')}</h4>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.stocks')}</span>
                  <span className="mc-data-value">{formatDisplayPercent(inputs.stocksPercent)}</span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.bonds')}</span>
                  <span className="mc-data-value">{formatDisplayPercent(inputs.bondsPercent)}</span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.cash')}</span>
                  <span className="mc-data-value">{formatDisplayPercent(inputs.cashPercent)}</span>
                </div>
              </div>

              {/* Expected Returns */}
              <div className="mc-data-group">
                <h4 className="mc-data-group-title">{t('monteCarlo.baseData.expectedReturns')}</h4>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.stockReturn')}</span>
                  <span className="mc-data-value">{formatDisplayPercent(inputs.expectedStockReturn)}</span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.bondReturn')}</span>
                  <span className="mc-data-value">{formatDisplayPercent(inputs.expectedBondReturn)}</span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.cashReturn')}</span>
                  <span className="mc-data-value">{formatDisplayPercent(inputs.expectedCashReturn)}</span>
                </div>
              </div>

              {/* Personal & Expenses */}
              <div className="mc-data-group">
                <h4 className="mc-data-group-title">{t('monteCarlo.baseData.personalExpenses')}</h4>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.currentAge')}</span>
                  <span className="mc-data-value">{t('monteCarlo.baseData.currentAgeValue', { age: currentAge })}</span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.currentExpenses')}</span>
                  <span className="mc-data-value">{formatCurrency(inputs.currentAnnualExpenses, defaultCurrency)}</span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.fireExpenses')}</span>
                  <span className="mc-data-value">{formatCurrency(inputs.fireAnnualExpenses, defaultCurrency)}</span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.withdrawalRate')}</span>
                  <span className="mc-data-value">{inputs.desiredWithdrawalRate}%</span>
                </div>
                <div className="mc-data-item">
                  <span className="mc-data-label">{t('monteCarlo.baseData.stopWorkingAtFIRE')}</span>
                  <span className="mc-data-value">{inputs.stopWorkingAtFIRE ? t('common.yes') : t('common.no')}</span>
                </div>
              </div>
            </div>
            <p className="mc-base-data-note">
              <MaterialIcon name="lightbulb" />
              <Trans i18nKey="monteCarlo.baseData.note">
                These values are loaded from the FIRE Calculator. To modify them, go to the <a href="/fire-calculator">FIRE Calculator</a> page.
              </Trans>
            </p>
          </div>
        )}
      </div>

      <div className="mc-inputs" data-tour="monte-carlo-params">
        <div className="form-group">
          <label htmlFor="num-simulations">{t('monteCarlo.params.numSimulations')}</label>
          <NumberInput
            id="num-simulations"
            value={mcInputs.numSimulations}
            onChange={(value) => handleInputChange('numSimulations', value)}
            allowDecimals={false}
          />
          {validationErrors.numSimulations && (
            <span className="input-error-message" role="alert">{validationErrors.numSimulations}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="stock-volatility">{t('monteCarlo.params.stockVolatility')}</label>
          <NumberInput
            id="stock-volatility"
            value={mcInputs.stockVolatility}
            onChange={(value) => handleInputChange('stockVolatility', value)}
          />
          {validationErrors.stockVolatility && (
            <span className="input-error-message" role="alert">{validationErrors.stockVolatility}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="bond-volatility">{t('monteCarlo.params.bondVolatility')}</label>
          <NumberInput
            id="bond-volatility"
            value={mcInputs.bondVolatility}
            onChange={(value) => handleInputChange('bondVolatility', value)}
          />
          {validationErrors.bondVolatility && (
            <span className="input-error-message" role="alert">{validationErrors.bondVolatility}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="black-swan-prob">{t('monteCarlo.params.blackSwanProb')}</label>
          <NumberInput
            id="black-swan-prob"
            value={mcInputs.blackSwanProbability}
            onChange={(value) => handleInputChange('blackSwanProbability', value)}
          />
          {validationErrors.blackSwanProbability && (
            <span className="input-error-message" role="alert">{validationErrors.blackSwanProbability}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="black-swan-impact">{t('monteCarlo.params.blackSwanImpact')}</label>
          <NumberInput
            id="black-swan-impact"
            value={mcInputs.blackSwanImpact}
            onChange={(value) => handleInputChange('blackSwanImpact', value)}
          />
          {validationErrors.blackSwanImpact && (
            <span className="input-error-message" role="alert">{validationErrors.blackSwanImpact}</span>
          )}
        </div>
      </div>

      {hasErrors && (
        <div className="validation-error-banner mc-validation-errors" role="alert" aria-live="polite">
          <strong><MaterialIcon name="warning" /> {t('monteCarlo.validation.fixErrors')}</strong>
        </div>
      )}

      <div data-tour="monte-carlo-run-btn">
        <button 
          className="run-simulation-btn" 
          onClick={runSimulation}
          disabled={isRunning || hasErrors}
          aria-label={isRunning ? t('monteCarlo.runningSimulationAria') : hasErrors ? t('monteCarlo.fixErrorsAria') : t('monteCarlo.runSimulationAria')}
        >
          {isRunning ? <MaterialIcon name="hourglass_empty" /> : <MaterialIcon name="play_arrow" />} {isRunning ? t('monteCarlo.runningSimulation') : t('monteCarlo.runSimulation')}
        </button>
      </div>

      {result && (
        <div className="mc-results" role="region" aria-labelledby="simulation-results-heading" aria-live="polite" data-tour="monte-carlo-results">
          <h3 id="simulation-results-heading">{t('monteCarlo.results.heading')}</h3>
          <div className="results-grid" role="list">
            <div className="result-card success" role="listitem">
              <div className="result-label">{t('monteCarlo.results.successRate')}</div>
              <div className="result-value">{formatDisplayPercent(result.successRate)}</div>
              <div className="result-subtitle">
                {t('monteCarlo.results.successfulSimulations')}: {result.successCount} / {result.successCount + result.failureCount}
              </div>
            </div>

            <div className="result-card" role="listitem">
              <div className="result-label">{t('monteCarlo.results.successfulSimulations')}</div>
              <div className="result-value">{result.successCount}</div>
            </div>

            <div className="result-card failure" role="listitem">
              <div className="result-label">{t('monteCarlo.results.failedSimulations')}</div>
              <div className="result-value">{result.failureCount}</div>
            </div>

            <div className="result-card" role="listitem">
              <div className="result-label">{t('monteCarlo.results.medianYears')}</div>
              <div className="result-value">
                {result.medianYearsToFIRE > 0 ? t('monteCarlo.results.medianYearsValue', { value: result.medianYearsToFIRE }) : t('common.notAvailable')}
              </div>
            </div>
          </div>

          <div className="success-bar" role="progressbar" aria-valuenow={result.successRate} aria-valuemin={0} aria-valuemax={100} aria-label={t('monteCarlo.results.successRateAria', { value: formatDisplayPercent(result.successRate) })}>
            <div className="success-bar-fill" style={{ width: `${result.successRate}%` }}>
              {result.successRate > 10 && formatDisplayPercent(result.successRate)}
            </div>
          </div>

          <MonteCarloChart result={result} isPrivacyMode={isPrivacyMode} />
        </div>
      )}

      {/* Simulation Logs Section */}
      {simulationLogs.length > 0 && fixedParameters && (
        <MonteCarloLogs 
          logs={simulationLogs} 
          fixedParameters={fixedParameters}
          isPrivacyMode={isPrivacyMode}
        />
      )}
    </section>
  );
};
