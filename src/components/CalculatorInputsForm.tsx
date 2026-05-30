import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CalculatorInputs } from '../types/calculator';
import { NumberInput } from './NumberInput';
import { SliderInput } from './SliderInput';
import { MaterialIcon } from './MaterialIcon';
import { PrivacyBlur } from './PrivacyBlur';
import { calculateYearsOfExpenses } from '../utils/fireCalculator';
import { 
  calculateAnnualExpensesFromTracker, 
  calculateAnnualIncomeFromTracker 
} from '../utils/expenseTrackerIntegration';
import { loadSettings } from '../utils/cookieSettings';
import { getCurrencySymbol } from '../utils/currencyConverter';

interface AssetAllocationData {
  totalValue: number;
  stocksPercent: number;
  bondsPercent: number;
  cashPercent: number;
}

interface CalculatorInputsProps {
  inputs: CalculatorInputs;
  onChange: (inputs: CalculatorInputs) => void;
  assetAllocationData?: AssetAllocationData; // Data from asset allocation page
  isPrivacyMode?: boolean;
}

export const CalculatorInputsForm: React.FC<CalculatorInputsProps> = ({ inputs, onChange, assetAllocationData, isPrivacyMode = false }) => {
  const { t } = useTranslation();
  // Get currency symbol from settings - recalculated on each render to pick up changes
  const settings = loadSettings();
  const currencySymbol = getCurrencySymbol(settings.currencySettings.defaultCurrency);

  const [openSections, setOpenSections] = useState({
    initialValues: !inputs.useAssetAllocationValue,
    assetAllocation: !inputs.useAssetAllocationValue,
    income: true,
    expenses: true,
    fireParams: true,
    expectedReturns: true,
    pension: true,
    options: true,
  });

  // Collapse Initial Values and Asset Allocation when "from asset allocation" is enabled
  useEffect(() => {
    if (inputs.useAssetAllocationValue) {
      setOpenSections(prev => ({
        ...prev,
        initialValues: false,
        assetAllocation: false,
      }));
    }
  }, [inputs.useAssetAllocationValue]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (field: keyof CalculatorInputs, value: number | boolean) => {
    const newInputs = { ...inputs, [field]: value };
    
    // Auto-calculate savings rate when income or expenses change
    if (field === 'annualLaborIncome' || field === 'currentAnnualExpenses') {
      const income = field === 'annualLaborIncome' ? value as number : inputs.annualLaborIncome;
      const expenses = field === 'currentAnnualExpenses' ? value as number : inputs.currentAnnualExpenses;
      
      if (income > 0) {
        const calculatedSavingsRate = ((income - expenses) / income) * 100;
        // Allow negative savings rate to represent deficit, but cap at 100% max
        newInputs.savingsRate = Math.min(100, calculatedSavingsRate);
      } else {
        // If income is 0, set savings rate to 0
        newInputs.savingsRate = 0;
      }
    }
    
    // Auto-calculate yearsOfExpenses when withdrawal rate changes
    if (field === 'desiredWithdrawalRate') {
      newInputs.yearsOfExpenses = calculateYearsOfExpenses(value as number);
    }
    
    onChange(newInputs);
  };

  // Calculate yearsOfExpenses from withdrawal rate (always derived, not user-editable)
  const calculatedYearsOfExpenses = calculateYearsOfExpenses(inputs.desiredWithdrawalRate);

  // Current year for age calculations
  const currentYear = new Date().getFullYear();

  // When using asset allocation data, show values from asset allocation page
  const effectivePortfolioValue = inputs.useAssetAllocationValue && assetAllocationData 
    ? assetAllocationData.totalValue 
    : inputs.initialSavings;
  const effectiveStocksPercent = inputs.useAssetAllocationValue && assetAllocationData 
    ? assetAllocationData.stocksPercent 
    : inputs.stocksPercent;
  const effectiveBondsPercent = inputs.useAssetAllocationValue && assetAllocationData 
    ? assetAllocationData.bondsPercent 
    : inputs.bondsPercent;
  const effectiveCashPercent = inputs.useAssetAllocationValue && assetAllocationData 
    ? assetAllocationData.cashPercent 
    : inputs.cashPercent;

  // When using expense tracker data, calculate from last 12 months
  const effectiveCurrentExpenses = inputs.useExpenseTrackerExpenses
    ? calculateAnnualExpensesFromTracker(undefined, Math.abs(inputs.expectedCashReturn))
    : inputs.currentAnnualExpenses;
  
  const effectiveLaborIncome = inputs.useExpenseTrackerIncome
    ? calculateAnnualIncomeFromTracker(undefined, inputs.laborIncomeGrowthRate)
    : inputs.annualLaborIncome;

  // Calculate effective savings rate based on whether expense tracker flags are enabled
  const effectiveSavingsRate = (() => {
    const income = effectiveLaborIncome;
    const expenses = effectiveCurrentExpenses;
    if (income > 0) {
      const rate = ((income - expenses) / income) * 100;
      return Math.min(100, rate);
    }
    return 0;
  })();

  return (
    <div className="inputs-form">
      <h2>{t('fireCalculator.title')}</h2>
      
      <div id="section-initial-values" className="form-section collapsible-section" data-tour="initial-savings">
        <button 
          className="collapsible-header" 
          onClick={() => toggleSection('initialValues')}
          aria-expanded={openSections.initialValues}
          aria-controls="initial-values-content"
        >
          <h3>
            <MaterialIcon name="savings" /> {t('fireCalculator.sections.initialValues')}
            {inputs.useAssetAllocationValue && <span className="calculated-label"> - {t('fireCalculator.fromAssetAllocation')}</span>}
            <span className="collapse-icon-small" aria-hidden="true">{openSections.initialValues ? '▼' : '▶'}</span>
          </h3>
        </button>
        {openSections.initialValues && (<div id="initial-values-content" className="form-section-content">
        <div className="form-group">
          <label htmlFor="initial-savings">
            {t('fireCalculator.labels.initialSavings', { currency: currencySymbol })}
            {inputs.useAssetAllocationValue && <span className="calculated-label"> - {t('fireCalculator.fromAssetAllocation')}</span>}
          </label>
          {inputs.useAssetAllocationValue ? (
            <PrivacyBlur isPrivacyMode={isPrivacyMode}>
              <input
                id="initial-savings"
                type="number"
                inputMode="decimal"
                value={effectivePortfolioValue.toFixed(2)}
                readOnly
                className="calculated-field"
                aria-readonly="true"
              />
            </PrivacyBlur>
          ) : (
            <PrivacyBlur isPrivacyMode={isPrivacyMode}>
              <NumberInput
                id="initial-savings"
                value={inputs.initialSavings}
                onChange={(value) => handleChange('initialSavings', value)}
              />
            </PrivacyBlur>
          )}
        </div>
        </div>)}
      </div>

      <div id="section-asset-allocation" className="form-section collapsible-section">
        <button 
          className="collapsible-header" 
          onClick={() => toggleSection('assetAllocation')}
          aria-expanded={openSections.assetAllocation}
          aria-controls="asset-allocation-content"
        >
          <h3>
            <MaterialIcon name="pie_chart" /> {t('fireCalculator.sections.assetAllocation')}
            {inputs.useAssetAllocationValue && <span className="calculated-label"> - {t('fireCalculator.fromAssetAllocation')}</span>}
            <span className="collapse-icon-small" aria-hidden="true">{openSections.assetAllocation ? '▼' : '▶'}</span>
          </h3>
        </button>
        {openSections.assetAllocation && (<div id="asset-allocation-content" className="form-section-content">
        <div className="form-group">
          <label htmlFor="stocks-percent">{t('fireCalculator.labels.stocksPercent')}</label>
          {inputs.useAssetAllocationValue ? (
            <input
              id="stocks-percent"
              type="number"
              inputMode="decimal"
              value={effectiveStocksPercent.toFixed(2)}
              readOnly
              className="calculated-field"
              aria-readonly="true"
            />
          ) : (
            <NumberInput
              id="stocks-percent"
              value={inputs.stocksPercent}
              onChange={(value) => handleChange('stocksPercent', value)}
            />
          )}
        </div>
        <div className="form-group">
          <label htmlFor="bonds-percent">{t('fireCalculator.labels.bondsPercent')}</label>
          {inputs.useAssetAllocationValue ? (
            <input
              id="bonds-percent"
              type="number"
              inputMode="decimal"
              value={effectiveBondsPercent.toFixed(2)}
              readOnly
              className="calculated-field"
              aria-readonly="true"
            />
          ) : (
            <NumberInput
              id="bonds-percent"
              value={inputs.bondsPercent}
              onChange={(value) => handleChange('bondsPercent', value)}
            />
          )}
        </div>
        <div className="form-group">
          <label htmlFor="cash-percent">{t('fireCalculator.labels.cashPercent')}</label>
          {inputs.useAssetAllocationValue ? (
            <input
              id="cash-percent"
              type="number"
              inputMode="decimal"
              value={effectiveCashPercent.toFixed(2)}
              readOnly
              className="calculated-field"
              aria-readonly="true"
            />
          ) : (
            <NumberInput
              id="cash-percent"
              value={inputs.cashPercent}
              onChange={(value) => handleChange('cashPercent', value)}
            />
          )}
        </div>
        <div className="allocation-sum" role="status" aria-live="polite">
          {t('fireCalculator.allocationTotal', { value: (effectiveStocksPercent + effectiveBondsPercent + effectiveCashPercent).toFixed(2) })}
          {Math.abs((effectiveStocksPercent + effectiveBondsPercent + effectiveCashPercent) - 100) > 0.01 && 
            <span className="warning"> <MaterialIcon name="warning" size="small" /> {t('fireCalculator.allocationWarning')}</span>
          }
        </div>
        </div>)}
      </div>

      <div id="section-income" className="form-section collapsible-section" data-tour="income-section">
        <button 
          className="collapsible-header" 
          onClick={() => toggleSection('income')}
          aria-expanded={openSections.income}
          aria-controls="income-content"
        >
          <h3><MaterialIcon name="payments" /> {t('fireCalculator.sections.income')} <span className="collapse-icon-small" aria-hidden="true">{openSections.income ? '▼' : '▶'}</span></h3>
        </button>
        {openSections.income && (<div id="income-content" className="form-section-content">
        <div className="form-group">
          <label htmlFor="labor-income">{t('fireCalculator.labels.laborIncome', { currency: currencySymbol })}</label>
          {inputs.useExpenseTrackerIncome ? (
            <PrivacyBlur isPrivacyMode={isPrivacyMode}>
              <input
                id="labor-income"
                type="number"
                inputMode="decimal"
                value={effectiveLaborIncome.toFixed(2)}
                readOnly
                className="calculated-field"
                aria-readonly="true"
              />
            </PrivacyBlur>
          ) : (
            <PrivacyBlur isPrivacyMode={isPrivacyMode}>
              <NumberInput
                id="labor-income"
                value={inputs.annualLaborIncome}
                onChange={(value) => handleChange('annualLaborIncome', value)}
              />
            </PrivacyBlur>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="labor-income-growth">{t('fireCalculator.labels.laborIncomeGrowthRate')}</label>
          <NumberInput
            id="labor-income-growth"
            value={inputs.laborIncomeGrowthRate}
            onChange={(value) => handleChange('laborIncomeGrowthRate', value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="other-income">{t('fireCalculator.labels.otherIncome', { currency: currencySymbol })}</label>
          <PrivacyBlur isPrivacyMode={isPrivacyMode}>
            <NumberInput
              id="other-income"
              value={inputs.otherIncome}
              onChange={(value) => handleChange('otherIncome', value)}
            />
          </PrivacyBlur>
        </div>
        </div>)}
      </div>

      <div id="section-pension" className="form-section collapsible-section">
        <button 
          className="collapsible-header" 
          onClick={() => toggleSection('pension')}
          aria-expanded={openSections.pension}
          aria-controls="pension-content"
        >
          <h3><MaterialIcon name="account_balance" /> {t('fireCalculator.sections.pension')} <span className="collapse-icon-small" aria-hidden="true">{openSections.pension ? '▼' : '▶'}</span></h3>
        </button>
        {openSections.pension && (<div id="pension-content" className="form-section-content">
        <div className="form-group">
          <label htmlFor="retirement-age">{t('fireCalculator.labels.retirementAge')}</label>
          <NumberInput
            id="retirement-age"
            value={inputs.retirementAge}
            onChange={(value) => handleChange('retirementAge', value)}
            allowDecimals={false}
          />
        </div>
        <div className="form-group">
          <label htmlFor="state-pension">{t('fireCalculator.labels.statePension', { currency: currencySymbol })}</label>
          <PrivacyBlur isPrivacyMode={isPrivacyMode}>
            <NumberInput
              id="state-pension"
              value={inputs.statePensionIncome}
              onChange={(value) => handleChange('statePensionIncome', value)}
            />
          </PrivacyBlur>
        </div>
        <div className="form-group">
          <label htmlFor="private-pension">{t('fireCalculator.labels.privatePension', { currency: currencySymbol })}</label>
          <PrivacyBlur isPrivacyMode={isPrivacyMode}>
            <NumberInput
              id="private-pension"
              value={inputs.privatePensionIncome}
              onChange={(value) => handleChange('privatePensionIncome', value)}
            />
          </PrivacyBlur>
        </div>
        </div>)}
      </div>

      <div id="section-expenses" className="form-section collapsible-section" data-tour="expenses-section">
        <button 
          className="collapsible-header" 
          onClick={() => toggleSection('expenses')}
          aria-expanded={openSections.expenses}
          aria-controls="expenses-content"
        >
          <h3><MaterialIcon name="shopping_cart" /> {t('fireCalculator.sections.expenses')} <span className="collapse-icon-small" aria-hidden="true">{openSections.expenses ? '▼' : '▶'}</span></h3>
        </button>
        {openSections.expenses && (<div id="expenses-content" className="form-section-content">
        <div className="form-group">
          <label htmlFor="current-expenses">{t('fireCalculator.labels.currentExpenses', { currency: currencySymbol })}</label>
          {inputs.useExpenseTrackerExpenses ? (
            <PrivacyBlur isPrivacyMode={isPrivacyMode}>
              <input
                id="current-expenses"
                type="number"
                inputMode="decimal"
                value={effectiveCurrentExpenses.toFixed(2)}
                readOnly
                className="calculated-field"
                aria-readonly="true"
              />
            </PrivacyBlur>
          ) : (
            <PrivacyBlur isPrivacyMode={isPrivacyMode}>
              <NumberInput
                id="current-expenses"
                value={inputs.currentAnnualExpenses}
                onChange={(value) => handleChange('currentAnnualExpenses', value)}
              />
            </PrivacyBlur>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="fire-expenses">{t('fireCalculator.labels.fireExpenses', { currency: currencySymbol })}</label>
          <PrivacyBlur isPrivacyMode={isPrivacyMode}>
            <NumberInput
              id="fire-expenses"
              value={inputs.fireAnnualExpenses}
              onChange={(value) => handleChange('fireAnnualExpenses', value)}
            />
          </PrivacyBlur>
        </div>
        <div className="form-group">
          <label htmlFor="savings-rate">{t('fireCalculator.labels.savingsRate')} <span className="calculated-label">- {t('fireCalculator.autoCalculated')}</span></label>
          <PrivacyBlur isPrivacyMode={isPrivacyMode}>
            <input
              id="savings-rate"
              type="number"
              inputMode="decimal"
              value={effectiveSavingsRate.toFixed(2)}
              readOnly
              className="calculated-field"
              aria-readonly="true"
            />
          </PrivacyBlur>
        </div>
        </div>)}
      </div>

      <div id="section-fire-params" className="form-section collapsible-section" data-tour="fire-params">
        <button 
          className="collapsible-header" 
          onClick={() => toggleSection('fireParams')}
          aria-expanded={openSections.fireParams}
          aria-controls="fire-params-content"
        >
          <h3><MaterialIcon name="gps_fixed" /> {t('fireCalculator.sections.fireParams')} <span className="collapse-icon-small" aria-hidden="true">{openSections.fireParams ? '▼' : '▶'}</span></h3>
        </button>
        {openSections.fireParams && (<div id="fire-params-content" className="form-section-content">
        <div className="form-group">
          <label htmlFor="current-age">{t('fireCalculator.labels.currentAge')}</label>
          <NumberInput
            id="current-age"
            value={currentYear - inputs.yearOfBirth}
            onChange={(value) => handleChange('yearOfBirth', currentYear - value)}
            allowDecimals={false}
          />
        </div>
        <div className="form-group">
          <label htmlFor="withdrawal-rate">{t('fireCalculator.labels.withdrawalRate')}</label>
          <NumberInput
            id="withdrawal-rate"
            value={inputs.desiredWithdrawalRate}
            onChange={(value) => handleChange('desiredWithdrawalRate', value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="years-of-expenses">{t('fireCalculator.labels.yearsOfExpenses')} <span className="calculated-label">- {t('fireCalculator.autoCalculated')}</span></label>
          <input
            id="years-of-expenses"
            type="number"
            inputMode="decimal"
            value={calculatedYearsOfExpenses.toFixed(2)}
            readOnly
            className="calculated-field"
            aria-readonly="true"
          />
        </div>
        </div>)}
      </div>

      <div id="section-expected-returns" className="form-section collapsible-section">
        <button 
          className="collapsible-header" 
          onClick={() => toggleSection('expectedReturns')}
          aria-expanded={openSections.expectedReturns}
          aria-controls="expected-returns-content"
        >
          <h3><MaterialIcon name="trending_up" /> {t('fireCalculator.sections.expectedReturns')} <span className="collapse-icon-small" aria-hidden="true">{openSections.expectedReturns ? '▼' : '▶'}</span></h3>
        </button>
        {openSections.expectedReturns && (<div id="expected-returns-content" className="form-section-content">
        <div className="form-group">
          <label htmlFor="stock-return">{t('fireCalculator.labels.stockReturn')}</label>
          <SliderInput
            id="stock-return"
            value={inputs.expectedStockReturn}
            onChange={(value) => handleChange('expectedStockReturn', value)}
            min={-10}
            max={20}
            step={0.1}
          />
        </div>
        <div className="form-group">
          <label htmlFor="bond-return">{t('fireCalculator.labels.bondReturn')}</label>
          <SliderInput
            id="bond-return"
            value={inputs.expectedBondReturn}
            onChange={(value) => handleChange('expectedBondReturn', value)}
            min={-5}
            max={15}
            step={0.1}
          />
        </div>
        <div className="form-group">
          <label htmlFor="cash-return">{t('fireCalculator.labels.cashReturn')}</label>
          <SliderInput
            id="cash-return"
            value={inputs.expectedCashReturn}
            onChange={(value) => handleChange('expectedCashReturn', value)}
            min={-10}
            max={5}
            step={0.1}
          />
          {inputs.expectedCashReturn > 0 && (
            <div className="deflation-warning" role="alert">
              <MaterialIcon name="warning" /> {t('fireCalculator.deflationWarning')}
            </div>
          )}
        </div>
        </div>)}
      </div>

      <div id="section-options" className="form-section collapsible-section" data-tour="options-section">
        <button 
          className="collapsible-header" 
          onClick={() => toggleSection('options')}
          aria-expanded={openSections.options}
          aria-controls="options-content"
        >
          <h3><MaterialIcon name="settings" /> {t('fireCalculator.sections.options')} <span className="collapse-icon-small" aria-hidden="true">{openSections.options ? '▼' : '▶'}</span></h3>
        </button>
        {openSections.options && (<div id="options-content" className="form-section-content">
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={inputs.stopWorkingAtFIRE}
              onChange={(e) => handleChange('stopWorkingAtFIRE', e.target.checked)}
            />
            <span className="toggle-switch"></span>
            {t('fireCalculator.options.stopWorking')}
          </label>
        </div>
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={inputs.useAssetAllocationValue}
              onChange={(e) => handleChange('useAssetAllocationValue', e.target.checked)}
            />
            <span className="toggle-switch"></span>
            {t('fireCalculator.options.useAssetAllocation')}
          </label>
        </div>
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={inputs.useExpenseTrackerExpenses}
              onChange={(e) => handleChange('useExpenseTrackerExpenses', e.target.checked)}
            />
            <span className="toggle-switch"></span>
            {t('fireCalculator.options.useExpenseTrackerExpenses')}
          </label>
        </div>
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={inputs.useExpenseTrackerIncome}
              onChange={(e) => handleChange('useExpenseTrackerIncome', e.target.checked)}
            />
            <span className="toggle-switch"></span>
            {t('fireCalculator.options.useExpenseTrackerIncome')}
          </label>
        </div>
        </div>)}
      </div>
    </div>
  );
};
