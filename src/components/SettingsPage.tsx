import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, DEFAULT_FIRE_ASSET_CLASS_INCLUSION, type UserSettings } from '../utils/cookieSettings';
import { SUPPORTED_CURRENCIES, DEFAULT_FALLBACK_RATES, type SupportedCurrency } from '../types/currency';
import { ALL_COUNTRIES, isEUCountry } from '../types/country';
import { recalculateFallbackRates, convertAssetsToNewCurrency, convertNetWorthDataToNewCurrency, convertExpenseDataToNewCurrency, convertFireCalculatorInputsToNewCurrency } from '../utils/currencyConverter';
import { exportFireCalculatorToCSV, exportAssetAllocationToCSV, importFireCalculatorFromCSV, importAssetAllocationFromCSV, exportExpenseTrackerToCSV, importExpenseTrackerFromCSV, exportNetWorthTrackerToJSON, importNetWorthTrackerFromJSON } from '../utils/csvExport';
import { loadFireCalculatorInputs, loadAssetAllocation, saveFireCalculatorInputs, saveAssetAllocation, clearAllData, loadExpenseTrackerData, saveExpenseTrackerData, loadNetWorthTrackerData, saveNetWorthTrackerData } from '../utils/cookieStorage';
import { DEFAULT_INPUTS, getDemoNetWorthData, getDemoAssetAllocationData } from '../utils/defaults';
import { generateDemoExpenseData } from '../utils/demoExpenseData';
import { formatWithSeparator, validateNumberInput } from '../utils/inputValidation';
import { clearTourPreference } from '../utils/tourPreferences';
import { clearQuestionnairePromptPreference } from '../utils/questionnairePromptPreferences';
import { exportAllDataAsJSON, importAllDataFromJSON, serializeAllDataExport } from '../utils/dataExportImport';
import { loadNotificationState, updateNotificationPreferences, clearNotifications, addNotification } from '../utils/notificationStorage';
import { type NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../types/notification';
import { generateDemoTourNotifications } from '../utils/notificationGenerator';
import { 
  ExpenseTrackerData, 
  CustomCategory, 
  CategoryOverride,
} from '../types/expenseTracker';
import { Tooltip } from './Tooltip';
import { MaterialIcon } from './MaterialIcon';
import { AssetClass } from '../types/assetAllocation';
import { formatAssetName } from '../utils/allocationCalculator';
import { fetchAssetPrices } from '../utils/dcaCalculator';
import { fetchExchangeRatesAsMap } from '../utils/exchangeRateApi';
import { CategoryManagerDialog } from './CategoryManagerDialog';
import { SearchableSelect } from './SearchableSelect';
import './SettingsPage.css';

interface SettingsPageProps {
  onSettingsChange?: (settings: UserSettings) => void;
}

// Section identifiers for collapsible state
const SETTINGS_SECTIONS = ['account', 'fire', 'display', 'privacy', 'experimental', 'notifications', 'email', 'disclaimer', 'currency', 'marketData', 'categories', 'data', 'support'] as const;
type SettingsSection = typeof SETTINGS_SECTIONS[number];

export const SettingsPage: React.FC<SettingsPageProps> = ({ onSettingsChange }) => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rateTextValues, setRateTextValues] = useState<Record<string, string>>({});
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  
  // Category management state
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [expenseData, setExpenseData] = useState<ExpenseTrackerData | null>(null);
  
  // Market data state
  const [marketDataPrices, setMarketDataPrices] = useState<Record<string, number | null>>({});
  const [marketDataRates, setMarketDataRates] = useState<{ rates: Record<string, number>; isUsingFallback: boolean; lastUpdate: string; error?: string } | null>(null);
  const [isMarketDataLoading, setIsMarketDataLoading] = useState(false);
  const [marketDataFetchedAt, setMarketDataFetchedAt] = useState<string | null>(null);
  
  // Account section expanded by default, others collapsed
  const [collapsedSections, setCollapsedSections] = useState<Set<SettingsSection>>(
    () => {
      const collapsed = new Set(SETTINGS_SECTIONS);
      collapsed.delete('account');
      return collapsed;
    }
  );

  // Toggle section collapse state
  const toggleSection = (section: SettingsSection) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  // Initialize rate text values when settings load, default currency, or decimal separator changes
  useEffect(() => {
    const textValues: Record<string, string> = {};
    SUPPORTED_CURRENCIES.filter(c => c.code !== settings.currencySettings.defaultCurrency).forEach((currency) => {
      const rate = settings.currencySettings.fallbackRates[currency.code] ?? DEFAULT_FALLBACK_RATES[currency.code];
      textValues[currency.code] = formatWithSeparator(rate, settings.decimalSeparator);
    });
    setRateTextValues(textValues);
  }, [settings.currencySettings.fallbackRates, settings.currencySettings.defaultCurrency, settings.decimalSeparator]);

  // Load settings on mount
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    
    // Load notification preferences
    const notifState = loadNotificationState();
    setNotificationPrefs(notifState.preferences);
    
    // Load expense tracker data for category management
    const expenseTrackerData = loadExpenseTrackerData();
    if (expenseTrackerData) {
      setExpenseData(expenseTrackerData);
    }
    
    setIsLoading(false);
  }, []);

  // Show temporary message
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };
  
  // Open category manager
  const handleOpenCategoryManager = () => {
    // Reload expense data in case it changed
    const data = loadExpenseTrackerData();
    if (data) {
      setExpenseData(data);
    }
    setShowCategoryManager(true);
  };
  
  // Add custom category
  const handleAddCategory = useCallback((category: CustomCategory) => {
    if (!expenseData) return;
    
    const newData = {
      ...expenseData,
      customCategories: [...(expenseData.customCategories || []), category],
    };
    setExpenseData(newData);
    saveExpenseTrackerData(newData);
    showMessage('success', `Category "${category.name}" added!`);
  }, [expenseData]);
  
  // Update custom category
  const handleUpdateCategory = useCallback((category: CustomCategory) => {
    if (!expenseData) return;
    
    const newData = {
      ...expenseData,
      customCategories: (expenseData.customCategories || []).map(c =>
        c.id === category.id ? category : c
      ),
    };
    setExpenseData(newData);
    saveExpenseTrackerData(newData);
    showMessage('success', `Category "${category.name}" updated!`);
  }, [expenseData]);
  
  // Delete custom category
  const handleDeleteCategory = useCallback((categoryId: string, reassignTo?: string) => {
    if (!expenseData) return;
    
    const category = expenseData.customCategories?.find(c => c.id === categoryId);
    const newData = {
      ...expenseData,
      customCategories: (expenseData.customCategories || []).filter(c => c.id !== categoryId),
      // Also reassign expenses if needed
      years: reassignTo ? expenseData.years.map(year => ({
        ...year,
        months: year.months.map(month => ({
          ...month,
          expenses: month.expenses.map(expense =>
            expense.category === categoryId ? { ...expense, category: reassignTo } : expense
          ),
        })),
      })) : expenseData.years,
    };
    setExpenseData(newData);
    saveExpenseTrackerData(newData);
    showMessage('success', `Category "${category?.name || 'Unknown'}" deleted!`);
  }, [expenseData]);
  
  // Update built-in category override
  const handleUpdateBuiltInCategory = useCallback((override: CategoryOverride) => {
    if (!expenseData) return;
    
    const existingOverrides = expenseData.categoryOverrides || [];
    const existingIndex = existingOverrides.findIndex(o => o.id === override.id);
    
    let newOverrides: CategoryOverride[];
    if (existingIndex >= 0) {
      newOverrides = existingOverrides.map((o, i) => 
        i === existingIndex ? { ...o, ...override } : o
      );
    } else {
      newOverrides = [...existingOverrides, override];
    }
    
    const newData = {
      ...expenseData,
      categoryOverrides: newOverrides,
    };
    setExpenseData(newData);
    saveExpenseTrackerData(newData);
    showMessage('success', 'Category updated!');
  }, [expenseData]);
  
  // Get expense count for category
  const getExpenseCountForCategory = useCallback((categoryId: string): number => {
    if (!expenseData) return 0;
    let count = 0;
    for (const yearData of expenseData.years) {
      for (const monthData of yearData.months) {
        count += monthData.expenses.filter(e => e.category === categoryId).length;
      }
    }
    return count;
  }, [expenseData]);

  // Fetch all market data (asset prices + exchange rates)
  const handleFetchMarketData = async () => {
    setIsMarketDataLoading(true);

    // Get all assets with tickers
    const { assets } = loadAssetAllocation();
    const tickers = assets
      ? [...new Set(assets.filter(a => a.ticker && a.ticker.trim()).map(a => a.ticker.trim().toUpperCase()))]
      : [];

    // Fetch asset prices and exchange rates in parallel
    const [prices, ratesResult] = await Promise.all([
      tickers.length > 0 ? fetchAssetPrices(tickers) : Promise.resolve({}),
      fetchExchangeRatesAsMap(),
    ]);

    setMarketDataPrices(prices);
    setMarketDataRates(ratesResult);
    setMarketDataFetchedAt(new Date().toISOString());
    setIsMarketDataLoading(false);

    // Persist live exchange rates to settings if available
    if (!ratesResult.isUsingFallback) {
      const newSettings = {
        ...settings,
        currencySettings: {
          ...settings.currencySettings,
          fallbackRates: ratesResult.rates,
          lastApiUpdate: ratesResult.lastUpdate,
        },
      };
      setSettings(newSettings);
      saveSettings(newSettings);
      onSettingsChange?.(newSettings);
    }
  };

  // Handle settings change
  const handleSettingChange = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange?.(newSettings);
    showMessage('success', 'Settings saved!');
  };

  // Handle fallback rate change
  const handleFallbackRateChange = (currency: SupportedCurrency, rate: number) => {
    if (rate <= 0) {
      showMessage('error', 'Rate must be a positive number');
      return;
    }
    
    const newSettings = {
      ...settings,
      currencySettings: {
        ...settings.currencySettings,
        fallbackRates: {
          ...settings.currencySettings.fallbackRates,
          [currency]: rate,
        },
      },
    };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange?.(newSettings);
    showMessage('success', `${currency} rate updated!`);
  };

  // Handle rate text input change (while typing)
  const handleRateTextChange = (currency: SupportedCurrency, textValue: string) => {
    setRateTextValues(prev => ({ ...prev, [currency]: textValue }));
  };

  // Handle rate text input blur (commit change)
  const handleRateTextBlur = (currency: SupportedCurrency) => {
    const textValue = rateTextValues[currency] || '';
    
    // Use shared validation function with decimal separator support
    const result = validateNumberInput(textValue, {
      min: 0.0001,
      allowNegative: false,
      allowDecimals: true,
      required: true,
      decimalSeparator: settings.decimalSeparator,
    });
    
    if (!result.isValid || result.parsedValue === undefined || result.parsedValue <= 0) {
      // Reset to current value on invalid input
      const currentRate = settings.currencySettings.fallbackRates[currency] ?? DEFAULT_FALLBACK_RATES[currency];
      setRateTextValues(prev => ({ 
        ...prev, 
        [currency]: formatWithSeparator(currentRate, settings.decimalSeparator) 
      }));
      showMessage('error', result.errorMessage || 'Rate must be a positive number');
      return;
    }
    
    handleFallbackRateChange(currency, result.parsedValue);
  };

  // Reset fallback rates to defaults
  const handleResetFallbackRates = () => {
    const newSettings = {
      ...settings,
      currencySettings: {
        ...settings.currencySettings,
        fallbackRates: { ...DEFAULT_FALLBACK_RATES },
      },
    };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange?.(newSettings);
    showMessage('success', 'Fallback rates reset to defaults!');
  };

  // Export all data as a single JSON file
  const handleExportAllJSON = () => {
    try {
      const fireInputs = loadFireCalculatorInputs();
      const { assets, assetClassTargets } = loadAssetAllocation();
      const expenseData = loadExpenseTrackerData();
      const netWorthData = loadNetWorthTrackerData();
      
      const exportData = exportAllDataAsJSON(
        fireInputs,
        assets,
        assetClassTargets,
        expenseData,
        netWorthData,
        settings.currencySettings.defaultCurrency
      );
      
      const jsonString = serializeAllDataExport(exportData);
      downloadFile(jsonString, `fire-tools-all-data-${getDateString()}.json`, 'application/json');
      
      showMessage('success', 'All data exported as JSON successfully!');
    } catch (error) {
      showMessage('error', `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Export all data as separate CSV/JSON files (legacy behavior)
  const handleExportAll = () => {
    try {
      // Export FIRE Calculator data
      const fireInputs = loadFireCalculatorInputs() || DEFAULT_INPUTS;
      const fireCSV = exportFireCalculatorToCSV(fireInputs);
      downloadFile(fireCSV, `fire-calculator-data-${getDateString()}.csv`, 'text/csv');

      // Export Asset Allocation data
      const { assets, assetClassTargets } = loadAssetAllocation();
      if (assets && assetClassTargets) {
        const assetCSV = exportAssetAllocationToCSV(assets, assetClassTargets);
        downloadFile(assetCSV, `asset-allocation-data-${getDateString()}.csv`, 'text/csv');
      }

      // Export Cashflow Tracker data
      const expenseData = loadExpenseTrackerData();
      if (expenseData) {
        const expenseCSV = exportExpenseTrackerToCSV(expenseData);
        downloadFile(expenseCSV, `cashflow-tracker-data-${getDateString()}.csv`, 'text/csv');
      }

      // Export Net Worth Tracker data
      const netWorthData = loadNetWorthTrackerData();
      if (netWorthData) {
        const netWorthJSON = exportNetWorthTrackerToJSON(netWorthData);
        downloadFile(netWorthJSON, `net-worth-tracker-data-${getDateString()}.json`, 'application/json');
      }

      showMessage('success', 'Data exported as separate files successfully!');
    } catch (error) {
      showMessage('error', `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Import all data from a JSON file
  const handleImportAllJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const imported = importAllDataFromJSON(
          json,
          settings.currencySettings.defaultCurrency,
          settings.currencySettings.fallbackRates
        );
        
        // Save all imported data
        if (imported.fireCalculator) {
          saveFireCalculatorInputs(imported.fireCalculator);
        }
        if (imported.assetAllocation.assets && imported.assetAllocation.assetClassTargets) {
          saveAssetAllocation(imported.assetAllocation.assets, imported.assetAllocation.assetClassTargets);
        }
        if (imported.expenseTracker) {
          saveExpenseTrackerData(imported.expenseTracker);
        }
        if (imported.netWorthTracker) {
          saveNetWorthTrackerData(imported.netWorthTracker);
        }
        
        showMessage('success', 'All data imported successfully! Refresh pages to see changes.');
      } catch (error) {
        showMessage('error', `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Helper to download file
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper to get date string for filenames
  const getDateString = () => new Date().toISOString().split('T')[0];

  // Import FIRE Calculator data
  const handleImportFire = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const imported = importFireCalculatorFromCSV(csv);
        saveFireCalculatorInputs(imported);
        showMessage('success', 'FIRE Calculator data imported successfully!');
      } catch (error) {
        showMessage('error', `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Import Asset Allocation data
  const handleImportAssets = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const imported = importAssetAllocationFromCSV(csv);
        saveAssetAllocation(imported.assets, imported.assetClassTargets);
        showMessage('success', 'Asset Allocation data imported successfully!');
      } catch (error) {
        showMessage('error', `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Import Cashflow Tracker data
  const handleImportCashflow = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const imported = importExpenseTrackerFromCSV(csv);
        saveExpenseTrackerData(imported);
        showMessage('success', 'Cashflow Tracker data imported successfully!');
      } catch (error) {
        showMessage('error', `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Import Net Worth Tracker data
  const handleImportNetWorth = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const imported = importNetWorthTrackerFromJSON(json);
        saveNetWorthTrackerData(imported);
        showMessage('success', 'Net Worth Tracker data imported successfully!');
      } catch (error) {
        showMessage('error', `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Reset all data
  const handleResetAll = () => {
    if (confirm('Are you sure you want to reset ALL data? This will clear all saved data from cookies and cannot be undone.')) {
      clearAllData();
      showMessage('success', 'All data has been reset!');
    }
  };

  // Load demo data
  const handleLoadDemoData = () => {
    if (confirm('This will overwrite your current data with demo data. Are you sure you want to continue?')) {
      try {
        // First, reset default currency to EUR and fallback rates BEFORE loading demo data
        // This ensures all demo data is loaded with EUR as the default currency
        const newSettings = {
          ...settings,
          currencySettings: {
            ...settings.currencySettings,
            defaultCurrency: 'EUR' as SupportedCurrency,
            fallbackRates: { ...DEFAULT_FALLBACK_RATES },
          },
        };
        setSettings(newSettings);
        saveSettings(newSettings);
        onSettingsChange?.(newSettings);
        
        // Load demo FIRE Calculator data
        saveFireCalculatorInputs(DEFAULT_INPUTS);
        
        // Load demo Asset Allocation data
        const { assets, assetClassTargets } = getDemoAssetAllocationData();
        saveAssetAllocation(assets, assetClassTargets);
        
        // Load demo Cashflow Tracker data with full year of randomized data
        const cashflowData = generateDemoExpenseData();
        saveExpenseTrackerData(cashflowData);
        
        // Load demo Net Worth Tracker data
        const netWorthData = getDemoNetWorthData();
        saveNetWorthTrackerData(netWorthData);
        
        showMessage('success', 'Demo data loaded successfully! Refresh the page to see the changes.');
      } catch (error) {
        showMessage('error', `Failed to load demo data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  // Handle notification preference change
  const handleNotificationPrefChange = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    const newPrefs = { ...notificationPrefs, [key]: value };
    setNotificationPrefs(newPrefs);
    updateNotificationPreferences({ [key]: value });
    showMessage('success', 'Notification preferences saved!');
  };

  // Clear all notifications
  const handleClearNotifications = () => {
    if (confirm('Are you sure you want to clear all notifications? This cannot be undone.')) {
      clearNotifications();
      showMessage('success', 'All notifications cleared!');
    }
  };

  // Trigger test notifications
  const handleTriggerTestNotifications = () => {
    const testNotifications = generateDemoTourNotifications();
    testNotifications.forEach(notification => {
      addNotification(notification);
    });
    showMessage('success', `${testNotifications.length} test notifications created! Check the notification bell.`);
  };

  if (isLoading) {
    return <div className="settings-page loading">Loading settings...</div>;
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <button className="back-button" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h1><MaterialIcon name="settings" /> Settings</h1>
        </div>

        {message && (
          <div className={`settings-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Account Settings */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('account')}
            aria-expanded={!collapsedSections.has('account')}
            aria-controls="account-content"
          >
            <h2><MaterialIcon name="person" /> Account <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('account') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('account') && (
            <div id="account-content" className="collapsible-content">
              <div className="setting-item account-name-setting">
                <div className="label-with-tooltip">
                  <label htmlFor="accountName">Account Name</label>
                  <Tooltip content="Choose a name for your portfolio that will appear in the app header and throughout the interface. This helps you identify your account, especially if you manage multiple portfolios.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <input
                  id="accountName"
                  type="text"
                  value={settings.accountName}
                  onChange={(e) => handleSettingChange('accountName', e.target.value)}
                  maxLength={100}
                  placeholder="My Portfolio"
                  className="account-name-input"
                />
                <span className="setting-help">This name will be displayed throughout the app</span>
              </div>
            </div>
          )}
        </section>

        {/* FIRE Calculation Settings */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('fire')}
            aria-expanded={!collapsedSections.has('fire')}
            aria-controls="fire-content"
          >
            <h2><MaterialIcon name="local_fire_department" /> FIRE Calculation <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('fire') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('fire') && (
            <div id="fire-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>Asset Classes Included in FIRE</label>
                  <Tooltip content="Select which asset classes count toward your FIRE target. Only included asset classes contribute to portfolio value in FIRE calculations.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <span className="setting-help">Toggle which asset classes are counted in your FIRE portfolio value</span>
                <div className="fire-asset-class-grid">
                  {(Object.keys(settings.fireAssetClassInclusion) as AssetClass[]).map(ac => (
                    <label key={ac} className="checkbox-label fire-asset-checkbox">
                      <input
                        type="checkbox"
                        checked={settings.fireAssetClassInclusion[ac]}
                        onChange={(e) => {
                          const newInclusion = {
                            ...settings.fireAssetClassInclusion,
                            [ac]: e.target.checked,
                          };
                          handleSettingChange('fireAssetClassInclusion', newInclusion);
                        }}
                      />
                      {formatAssetName(ac)}
                    </label>
                  ))}
                </div>
                <button
                  className="btn-outline btn-small"
                  onClick={() => handleSettingChange('fireAssetClassInclusion', DEFAULT_FIRE_ASSET_CLASS_INCLUSION)}
                  style={{ marginTop: '0.5rem' }}
                >
                  Reset to Defaults
                </button>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.includePrimaryResidenceInFIRE ?? true}
                      onChange={(e) => handleSettingChange('includePrimaryResidenceInFIRE', e.target.checked)}
                    />
                    Include Primary Residence in FIRE Calculation
                  </label>
                  <Tooltip content="When enabled, real estate properties marked as primary residence will be included in your FIRE portfolio value. When disabled, they are excluded (useful if you don't consider your home as liquid assets for retirement).">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <span className="setting-help">Controls whether your primary residence counts toward your FIRE target</span>
              </div>
            </div>
          )}
        </section>

        {/* Display Settings */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('display')}
            aria-expanded={!collapsedSections.has('display')}
            aria-controls="display-content"
          >
            <h2><MaterialIcon name="palette" /> Display <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('display') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('display') && (
            <div id="display-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="defaultCurrency">Default Currency</label>
                  <Tooltip content="Select your preferred currency for all financial data. When you change currencies, all existing values (assets, expenses, net worth, and FIRE calculator inputs) will be automatically converted using current exchange rates.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <SearchableSelect
                  options={SUPPORTED_CURRENCIES.map(c => ({
                    id: c.code,
                    label: `${c.symbol} ${c.name} (${c.code})`,
                  }))}
                  value={settings.currencySettings.defaultCurrency}
                  searchThreshold={settings.searchThreshold ?? 8}
                  onChange={(val) => {
                    const newCurrency = val as SupportedCurrency;
                    const oldCurrency = settings.currencySettings.defaultCurrency;
                    
                    if (newCurrency === oldCurrency) {
                      return;
                    }
                    
                    // Get current fallback rates before recalculation
                    const currentRates = settings.currencySettings.fallbackRates;
                    
                    // Convert all asset values to the new currency BEFORE recalculating rates
                    const { assets, assetClassTargets } = loadAssetAllocation();
                    if (assets && assetClassTargets) {
                      const convertedAssets = convertAssetsToNewCurrency(assets, oldCurrency, newCurrency, currentRates);
                      saveAssetAllocation(convertedAssets, assetClassTargets);
                    }
                    
                    // Convert Net Worth Tracker data
                    const netWorthData = loadNetWorthTrackerData();
                    if (netWorthData) {
                      const convertedNetWorth = convertNetWorthDataToNewCurrency(netWorthData, oldCurrency, newCurrency, currentRates);
                      saveNetWorthTrackerData(convertedNetWorth);
                    }
                    
                    // Convert Expense Tracker data
                    const expenseData = loadExpenseTrackerData();
                    if (expenseData) {
                      const convertedExpense = convertExpenseDataToNewCurrency(expenseData, oldCurrency, newCurrency, currentRates);
                      saveExpenseTrackerData(convertedExpense);
                    }
                    
                    // Convert FIRE Calculator inputs
                    const fireInputs = loadFireCalculatorInputs();
                    if (fireInputs) {
                      const convertedFireInputs = convertFireCalculatorInputsToNewCurrency(fireInputs, oldCurrency, newCurrency, currentRates);
                      saveFireCalculatorInputs(convertedFireInputs);
                    }
                    
                    // Recalculate fallback rates relative to the new default currency
                    const newFallbackRates = recalculateFallbackRates(
                      currentRates,
                      oldCurrency,
                      newCurrency
                    );
                    
                    const newSettings = {
                      ...settings,
                      currencySettings: {
                        ...settings.currencySettings,
                        defaultCurrency: newCurrency,
                        fallbackRates: newFallbackRates,
                      },
                    };
                    setSettings(newSettings);
                    saveSettings(newSettings);
                    onSettingsChange?.(newSettings);
                    showMessage('success', `Default currency changed to ${newCurrency}! All values converted.`);
                  }}
                  ariaLabel="Default currency"
                />
                <span className="setting-help">This currency will be used as default across all pages</span>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>Decimal Separator</label>
                  <Tooltip content="Choose how decimal numbers are formatted. Point format (1,000.00) is common in the US and UK. Comma format (1.000,00) is used in many European countries. This affects how you input and view numbers throughout the app.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${settings.decimalSeparator === '.' ? 'active' : ''}`}
                    onClick={() => handleSettingChange('decimalSeparator', '.')}
                  >
                    Point (1,000.00)
                  </button>
                  <button
                    className={`toggle-btn ${settings.decimalSeparator === ',' ? 'active' : ''}`}
                    onClick={() => handleSettingChange('decimalSeparator', ',')}
                  >
                    Comma (1.000,00)
                  </button>
                </div>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="decimalPlaces">Decimal Places</label>
                  <Tooltip content="Control the precision of small numbers. This setting only affects values below 1,000 to keep small amounts precise while keeping large amounts readable. For example, with 2 decimal places: 123.45 displays as '123.45' but 1,234.56 displays as '1,235'.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <select
                  id="decimalPlaces"
                  value={settings.decimalPlaces ?? 2}
                  onChange={(e) => handleSettingChange('decimalPlaces', parseInt(e.target.value, 10))}
                >
                  <option value={0}>0 (e.g., 123)</option>
                  <option value={1}>1 (e.g., 123.4)</option>
                  <option value={2}>2 (e.g., 123.45)</option>
                  <option value={3}>3 (e.g., 123.456)</option>
                  <option value={4}>4 (e.g., 123.4567)</option>
                </select>
                <span className="setting-help">Number of decimal places shown for values below 1,000. Values at or above 1,000 show no decimals.</span>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="dateFormat">Date Format</label>
                  <Tooltip content="Choose how dates are displayed throughout the app. DD/MM/YYYY is common in Europe, MM/DD/YYYY is common in the US, and YYYY-MM-DD is the ISO standard format.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <select
                  id="dateFormat"
                  value={settings.dateFormat ?? 'DD/MM/YYYY'}
                  onChange={(e) => handleSettingChange('dateFormat', e.target.value as 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD')}
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY (e.g., 31/12/2024)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (e.g., 12/31/2024)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g., 2024-12-31)</option>
                </select>
                <span className="setting-help">How dates are displayed throughout the app</span>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="searchThreshold">Dropdown Search Threshold</label>
                  <Tooltip content="Set the minimum number of items a dropdown must have before a search field appears. For example, with a threshold of 8, dropdowns with 8 or more items will include a search box to help you find options quickly.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <select
                  id="searchThreshold"
                  value={settings.searchThreshold ?? 8}
                  onChange={(e) => handleSettingChange('searchThreshold', parseInt(e.target.value, 10))}
                >
                  <option value={0}>Always (show search on all dropdowns)</option>
                  <option value={4}>4 items</option>
                  <option value={6}>6 items</option>
                  <option value={8}>8 items (default)</option>
                  <option value={10}>10 items</option>
                  <option value={15}>15 items</option>
                  <option value={999}>Never (disable dropdown search)</option>
                </select>
                <span className="setting-help">Dropdowns with this many items or more will show a search box</span>
              </div>
            </div>
          )}
        </section>

        {/* Privacy & Region Settings */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('privacy')}
            aria-expanded={!collapsedSections.has('privacy')}
            aria-controls="privacy-content"
          >
            <h2><MaterialIcon name="privacy_tip" /> Privacy & Region <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('privacy') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('privacy') && (
            <div id="privacy-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="privacyMode">Privacy Mode</label>
                  <Tooltip content="When enabled, sensitive financial data like net worth, income, and asset values will be blurred on screen. This is useful when sharing your screen or working in public. Expenses are not blurred.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${!settings.privacyMode ? 'active' : ''}`}
                    onClick={() => handleSettingChange('privacyMode', false)}
                  >
                    <MaterialIcon name="visibility" size="small" /> Show Values
                  </button>
                  <button
                    className={`toggle-btn ${settings.privacyMode ? 'active' : ''}`}
                    onClick={() => handleSettingChange('privacyMode', true)}
                  >
                    <MaterialIcon name="visibility_off" size="small" /> Hide Values
                  </button>
                </div>
                <span className="setting-help">Blur sensitive financial data on screen for privacy</span>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="country">Country</label>
                  <Tooltip content="Select your country of residence. EU countries will receive UCITS compliance warnings when adding non-EU domiciled ETFs, as these may not be available to EU investors.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <SearchableSelect
                  options={[
                    { id: '', label: 'Select country (optional)' },
                    ...ALL_COUNTRIES.map(c => ({
                      id: c.code,
                      label: `${c.flag} ${c.name}`,
                    }))
                  ]}
                  value={settings.country || ''}
                  onChange={(val) => handleSettingChange('country', val || undefined)}
                  searchThreshold={settings.searchThreshold ?? 8}
                  ariaLabel="Country"
                />
                {(() => {
                  const isEU = settings.country && isEUCountry(settings.country);
                  if (isEU) {
                    return (
                      <span className="setting-help eu-notice">
                        <MaterialIcon name="info" size="small" /> EU resident: You'll receive UCITS compliance warnings for non-EU ETFs
                      </span>
                    );
                  } else if (settings.country) {
                    return (
                      <span className="setting-help">Country set to {ALL_COUNTRIES.find(c => c.code === settings.country)?.name}</span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}
        </section>

        {/* Experimental Features */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('experimental')}
            aria-expanded={!collapsedSections.has('experimental')}
            aria-controls="experimental-content"
          >
            <h2><MaterialIcon name="science" /> Experimental Features <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('experimental') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('experimental') && (
            <div id="experimental-content" className="collapsible-content">
              <p className="setting-help" style={{ marginBottom: '1rem' }}>
                <MaterialIcon name="warning" size="small" /> These features are still in preview. They may be incomplete, change without notice, or rely on third-party data that may be inaccurate or unavailable.
              </p>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="experimentalPortfolioBreakdown">Portfolio Breakdown page</label>
                  <Tooltip content="Adds a new Portfolio Breakdown page that slices your current portfolio by currency, holding, sector, continent, region, market, and ETF provider. ETF metadata is inferred from fund names (Yahoo Finance does not expose holdings data without authentication), so results are heuristic.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${!settings.experimentalFeatures?.portfolioBreakdown ? 'active' : ''}`}
                    onClick={() => handleSettingChange('experimentalFeatures', { ...settings.experimentalFeatures, portfolioBreakdown: false })}
                  >
                    Disabled
                  </button>
                  <button
                    className={`toggle-btn ${settings.experimentalFeatures?.portfolioBreakdown ? 'active' : ''}`}
                    onClick={() => handleSettingChange('experimentalFeatures', { ...settings.experimentalFeatures, portfolioBreakdown: true })}
                  >
                    Enabled
                  </button>
                </div>
                <span className="setting-help">Enable the Portfolio Breakdown page in navigation</span>
              </div>
            </div>
          )}
        </section>

        {/* Notification Settings */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('notifications')}
            aria-expanded={!collapsedSections.has('notifications')}
            aria-controls="notifications-content"
          >
            <h2><MaterialIcon name="notifications" /> Notifications <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('notifications') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('notifications') && (
            <div id="notifications-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>Enable In-App Notifications</label>
                  <Tooltip content="Control whether you receive in-app notifications for reminders like new months, tax deadlines, and financial milestones.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${notificationPrefs.enableInAppNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableInAppNotifications', true)}
                  >
                    Enabled
                  </button>
                  <button
                    className={`toggle-btn ${!notificationPrefs.enableInAppNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableInAppNotifications', false)}
                  >
                    Disabled
                  </button>
                </div>
              </div>

              {notificationPrefs.enableInAppNotifications && (
                <>
                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.newMonthReminders}
                        onChange={(e) => handleNotificationPrefChange('newMonthReminders', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>New Month Reminders</span>
                    </label>
                    <span className="setting-help">Remind to update financial data at the start of each month</span>
                  </div>

                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.newQuarterReminders}
                        onChange={(e) => handleNotificationPrefChange('newQuarterReminders', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>New Quarter Reminders</span>
                    </label>
                    <span className="setting-help">Remind to review quarterly performance</span>
                  </div>

                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.taxReminders}
                        onChange={(e) => handleNotificationPrefChange('taxReminders', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>Tax Payment Reminders</span>
                    </label>
                    <span className="setting-help">Remind about upcoming tax deadlines</span>
                  </div>

                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.dcaReminders}
                        onChange={(e) => handleNotificationPrefChange('dcaReminders', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>DCA Investment Reminders</span>
                    </label>
                    <span className="setting-help">Remind about regular investment contributions</span>
                  </div>

                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.fireMilestones}
                        onChange={(e) => handleNotificationPrefChange('fireMilestones', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>FIRE Milestone Alerts</span>
                    </label>
                    <span className="setting-help">Get notified when you reach FIRE milestones (25%, 50%, 75%, 100%)</span>
                  </div>
                </>
              )}

              <div className="setting-item">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="science" /> Test Mode</h3>
                  <Tooltip content="Trigger sample notifications to test the notification system. This will add demo notifications to your notification bell so you can see how they look and work.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Create sample notifications to test the notification UI</p>
                <button className="secondary-btn" onClick={handleTriggerTestNotifications}>
                  <MaterialIcon name="notifications_active" /> Trigger Test Notifications
                </button>
              </div>

              <div className="setting-item">
                <button className="secondary-btn" onClick={handleClearNotifications}>
                  <MaterialIcon name="delete" /> Clear All Notifications
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Email Preferences */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('email')}
            aria-expanded={!collapsedSections.has('email')}
            aria-controls="email-content"
          >
            <h2><MaterialIcon name="email" /> Email Preferences <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('email') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('email') && (
            <div id="email-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>Email Notifications</label>
                  <Tooltip content="Email notifications require a server to send emails. Since Fire Tools is a client-side only application, email functionality is currently a placeholder for future development.">
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${notificationPrefs.enableEmailNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableEmailNotifications', true)}
                    disabled
                  >
                    Enabled
                  </button>
                  <button
                    className={`toggle-btn ${!notificationPrefs.enableEmailNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableEmailNotifications', false)}
                  >
                    Disabled
                  </button>
                </div>
                <span className="setting-help">🚧 Email notifications are not yet available (requires server integration)</span>
              </div>

              {notificationPrefs.enableEmailNotifications && (
                <>
                  <div className="setting-item">
                    <label htmlFor="emailAddress">Email Address</label>
                    <input
                      id="emailAddress"
                      type="email"
                      value={notificationPrefs.emailAddress}
                      onChange={(e) => handleNotificationPrefChange('emailAddress', e.target.value)}
                      placeholder="your@email.com"
                      disabled
                    />
                  </div>

                  <div className="setting-item">
                    <label htmlFor="emailFrequency">Email Frequency</label>
                    <select
                      id="emailFrequency"
                      value={notificationPrefs.emailFrequency}
                      onChange={(e) => handleNotificationPrefChange('emailFrequency', e.target.value as NotificationPreferences['emailFrequency'])}
                      disabled
                    >
                      <option value="NEVER">Never</option>
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Currency Settings */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('currency')}
            aria-expanded={!collapsedSections.has('currency')}
            aria-controls="currency-content"
          >
            <h2>
              <MaterialIcon name="currency_exchange" /> Conversion Rates
              <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('currency') ? '▶' : '▼'}</span>
            </h2>
          </button>
          {!collapsedSections.has('currency') && (
            <div id="currency-content" className="collapsible-content">
              <div className="exchange-rate-warning">
                <MaterialIcon name="warning" />
                <p>
                  Exchange rates are fetched from publicly available Yahoo Finance APIs via a community
                  open-source package. These rates may not reflect real-time values, may be delayed,
                  and the APIs could stop working at any time. Fallback rates are used when the API is unavailable.
                  For accurate financial decisions, please verify rates with your financial institution.
                </p>
              </div>
              
              <div className="subsection-header-with-tooltip">
                <h3>Fallback Rates</h3>
                <Tooltip content="These are backup exchange rates used when the live API is unavailable or slow. The app attempts to fetch real-time rates first. You can customize these rates based on your preferences or recent market rates." position="right" maxWidth={350}>
                  <span className="info-icon" aria-label="More information">i</span>
                </Tooltip>
              </div>
              <p className="section-description">
                These rates are used when the live exchange rate API is unavailable.
                All values convert to {settings.currencySettings.defaultCurrency} (the default currency).
              </p>
              <div className="fallback-rates-grid">
                {SUPPORTED_CURRENCIES.filter(c => c.code !== settings.currencySettings.defaultCurrency).map((currency) => (
                  <div key={currency.code} className="rate-item">
                    <label htmlFor={`rate-${currency.code}`}>
                      {currency.code} ({currency.name})
                    </label>
                    <div className="rate-input-wrapper">
                      <span className="rate-prefix">1 {currency.code} =</span>
                      <input
                        id={`rate-${currency.code}`}
                        type="text"
                        value={rateTextValues[currency.code] ?? formatWithSeparator(
                          settings.currencySettings.fallbackRates[currency.code] ?? DEFAULT_FALLBACK_RATES[currency.code],
                          settings.decimalSeparator
                        )}
                        onChange={(e) => handleRateTextChange(currency.code, e.target.value)}
                        onBlur={() => handleRateTextBlur(currency.code)}
                      />
                      <span className="rate-suffix">{settings.currencySettings.defaultCurrency}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="secondary-btn" onClick={handleResetFallbackRates}>
                Reset to Default Rates
              </button>
            </div>
          )}
        </section>

        {/* Market Data */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('marketData')}
            aria-expanded={!collapsedSections.has('marketData')}
            aria-controls="marketdata-content"
          >
            <h2>
              <MaterialIcon name="trending_up" /> Market Data
              <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('marketData') ? '▶' : '▼'}</span>
            </h2>
          </button>
          {!collapsedSections.has('marketData') && (
            <div id="marketdata-content" className="collapsible-content">
              <div className="market-data-disclaimer" role="note">
                <MaterialIcon name="info" />
                <div>
                  <strong>Disclaimer</strong>
                  <p>
                    Market data is fetched from publicly available Yahoo Finance APIs through a community
                    open-source package. This data is provided as an <strong>indication only</strong> and
                    may be delayed, incomplete, or inaccurate. We take <strong>no responsibility</strong> for
                    wrong or delayed market data. These APIs are not officially endorsed by Yahoo Finance
                    and may stop working at any time without notice. Always verify prices with your broker
                    or a professional financial data provider before making investment decisions.
                  </p>
                </div>
              </div>

              <div className="setting-item">
                <button
                  className="primary-btn"
                  onClick={handleFetchMarketData}
                  disabled={isMarketDataLoading}
                >
                  <MaterialIcon name={isMarketDataLoading ? 'hourglass_empty' : 'download'} size="small" />
                  {isMarketDataLoading ? 'Fetching…' : 'Fetch Current Market Data'}
                </button>
                {marketDataFetchedAt && (
                  <span className="setting-help">
                    Last fetched: {new Date(marketDataFetchedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Exchange Rates */}
              {marketDataRates && (
                <div className="setting-item">
                  <h3>Exchange Rates</h3>
                  {marketDataRates.error && (
                    <div className="exchange-rate-warning">
                      <MaterialIcon name="warning" />
                      <p>{marketDataRates.error}</p>
                    </div>
                  )}
                  <p className="section-description">
                    {marketDataRates.isUsingFallback
                      ? 'Using fallback rates (API unavailable)'
                      : `Live rates fetched at ${new Date(marketDataRates.lastUpdate).toLocaleString()}`}
                  </p>
                  <table className="market-data-table">
                    <thead>
                      <tr>
                        <th>Currency</th>
                        <th>Rate to {settings.currencySettings.defaultCurrency}</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SUPPORTED_CURRENCIES.filter(c => c.code !== settings.currencySettings.defaultCurrency).map(currency => {
                        const liveRate = marketDataRates.rates[currency.code];
                        const defaultRate = DEFAULT_FALLBACK_RATES[currency.code];
                        const isLive = !marketDataRates.isUsingFallback && liveRate !== undefined && liveRate !== defaultRate;
                        return (
                          <tr key={currency.code}>
                            <td><strong>{currency.code}</strong> ({currency.name})</td>
                            <td>{liveRate !== undefined ? liveRate.toFixed(6) : 'N/A'}</td>
                            <td className={isLive ? 'market-data-live' : 'market-data-fallback'}>
                              {isLive ? '● Live' : '○ Fallback'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Asset Prices */}
              {Object.keys(marketDataPrices).length > 0 && (
                <div className="setting-item">
                  <h3>Asset Prices</h3>
                  <p className="section-description">
                    Current market prices for your portfolio assets. Prices may be delayed.
                  </p>
                  <table className="market-data-table">
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Price</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(marketDataPrices).sort(([a], [b]) => a.localeCompare(b)).map(([ticker, price]) => (
                        <tr key={ticker}>
                          <td><strong>{ticker}</strong></td>
                          <td>{price !== null ? price.toFixed(2) : 'N/A'}</td>
                          <td className={price !== null ? 'market-data-live' : 'market-data-fallback'}>
                            {price !== null ? '● Available' : '✕ Unavailable'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!marketDataRates && Object.keys(marketDataPrices).length === 0 && !isMarketDataLoading && (
                <p className="section-description">
                  Click "Fetch Current Market Data" to load live prices and exchange rates from Yahoo Finance.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Expense Categories */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('categories')}
            aria-expanded={!collapsedSections.has('categories')}
            aria-controls="categories-content"
          >
            <h2><MaterialIcon name="category" /> Expense Categories <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('categories') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('categories') && (
            <div id="categories-content" className="collapsible-content">
              <p className="setting-help">
                Manage your expense categories. Create custom categories or customize the built-in ones.
              </p>
              <div className="setting-group">
                <button className="primary-btn" onClick={handleOpenCategoryManager}>
                  <MaterialIcon name="category" size="small" />
                  Manage Categories
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Data Management */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('data')}
            aria-expanded={!collapsedSections.has('data')}
            aria-controls="data-content"
          >
            <h2><MaterialIcon name="save" /> Data Management <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('data') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('data') && (
            <div id="data-content" className="collapsible-content">
              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3>Export All Data</h3>
                  <Tooltip content="Back up all your financial data. JSON format exports everything in one file that's easy to re-import. Separate files give you CSV/JSON files for each tool, useful for spreadsheet analysis." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Export all your data in a single file or as separate files</p>
                <div className="export-buttons">
                  <button className="primary-btn" onClick={handleExportAllJSON}>
                    <MaterialIcon name="download" /> Export as JSON (Single File)
                  </button>
                  <button className="secondary-btn" onClick={handleExportAll}>
                    <MaterialIcon name="download" /> Export as Separate Files
                  </button>
                </div>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3>Import All Data</h3>
                  <Tooltip content="Restore your data from a previously exported JSON file. All imported values will be automatically converted to your current default currency. This overwrites existing data." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Import all data from a single JSON file. Data will be converted to your current currency.</p>
                <label className="primary-btn import-label">
                  <MaterialIcon name="upload" /> Import All Data (JSON)
                  <input type="file" accept=".json" onChange={handleImportAllJSON} hidden />
                </label>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3>Import Individual Files</h3>
                  <Tooltip content="Import data for specific tools from CSV or JSON files. Useful if you want to update only one tool's data or migrate from other applications." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Import data from individual CSV/JSON files for each tool.</p>
                <div className="import-buttons">
                  <label className="secondary-btn import-label">
                    <MaterialIcon name="upload" /> Import FIRE Calculator
                    <input type="file" accept=".csv" onChange={handleImportFire} hidden />
                  </label>
                  <label className="secondary-btn import-label">
                    <MaterialIcon name="upload" /> Import Asset Allocation
                    <input type="file" accept=".csv" onChange={handleImportAssets} hidden />
                  </label>
                  <label className="secondary-btn import-label">
                    <MaterialIcon name="upload" /> Import Cashflow Tracker
                    <input type="file" accept=".csv" onChange={handleImportCashflow} hidden />
                  </label>
                  <label className="secondary-btn import-label">
                    <MaterialIcon name="upload" /> Import Net Worth Tracker
                    <input type="file" accept=".json" onChange={handleImportNetWorth} hidden />
                  </label>
                </div>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="school" /> Guided Tour</h3>
                  <Tooltip content="Take a step-by-step walkthrough of all Fire Tools features. The tour will show you how to use each tool and how they work together to help you achieve financial independence." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Restart the guided tour to learn about Fire Tools features</p>
                <button className="secondary-btn" onClick={() => {
                  clearTourPreference();
                  clearQuestionnairePromptPreference();
                  window.location.href = '/';
                }}>
                  <MaterialIcon name="refresh" /> Restart Tour
                </button>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="quiz" /> FIRE Questionnaire</h3>
                  <Tooltip content="Retake the FIRE persona questionnaire to get updated recommendations based on your current situation and goals. Your previous results will be replaced." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Retake the questionnaire to update your FIRE persona and recommendations</p>
                <button className="secondary-btn" onClick={() => navigate('/questionnaire')}>
                  <MaterialIcon name="edit" /> Retake Questionnaire
                </button>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="inventory_2" /> Demo Data</h3>
                  <Tooltip content="Load realistic sample data to explore all features of Fire Tools. Great for testing the app or learning how to use it. This will overwrite your current data, so export first if needed!" position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Load sample data to explore the application</p>
                <button className="secondary-btn" onClick={handleLoadDemoData}>
                  <MaterialIcon name="sports_esports" /> Load Demo Data
                </button>
              </div>

              <div className="data-management-group danger-zone">
                <h3><MaterialIcon name="warning" /> Danger Zone</h3>
                <p className="setting-help">This action cannot be undone</p>
                <button className="danger-btn" onClick={handleResetAll}>
                  <MaterialIcon name="delete" /> Reset All Data
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Support & Feedback */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('support')}
            aria-expanded={!collapsedSections.has('support')}
            aria-controls="support-content"
          >
            <h2><MaterialIcon name="help" /> Support & Feedback <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('support') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('support') && (
            <div id="support-content" className="collapsible-content">
              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="bug_report" /> Report a Bug</h3>
                  <Tooltip content="Found something not working correctly? Report a bug to help us improve Fire Tools. You'll be taken to GitHub to submit the report." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Report bugs, UI issues, or calculation errors</p>
                <a 
                  href="https://github.com/mbianchidev/fire-tools/issues/new?template=bug_report.yml" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="secondary-btn external-link-btn"
                >
                  <MaterialIcon name="open_in_new" /> Report a Bug
                </a>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="lightbulb" /> Request a Feature</h3>
                  <Tooltip content="Have an idea for a new feature or improvement? We'd love to hear it! You'll be taken to GitHub to submit your suggestion." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Suggest new features or improvements</p>
                <a 
                  href="https://github.com/mbianchidev/fire-tools/issues/new?template=feature_request.yml" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="secondary-btn external-link-btn"
                >
                  <MaterialIcon name="open_in_new" /> Request a Feature
                </a>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="palette" /> UX/UI Suggestion</h3>
                  <Tooltip content="Have ideas to improve the look and feel of Fire Tools? Share your UX/UI suggestions with us on GitHub." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Suggest improvements to the user interface or experience</p>
                <a 
                  href="https://github.com/mbianchidev/fire-tools/issues/new?template=ux_ui_suggestion.yml" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="secondary-btn external-link-btn"
                >
                  <MaterialIcon name="open_in_new" /> Suggest UX/UI Improvement
                </a>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="security" /> Report Security Issue</h3>
                  <Tooltip content="Found a security vulnerability? Please report it privately through GitHub's security advisory feature. Do not create a public issue for security concerns." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">Report security vulnerabilities privately</p>
                <a 
                  href="https://github.com/mbianchidev/fire-tools/security/advisories/new" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="secondary-btn external-link-btn"
                >
                  <MaterialIcon name="open_in_new" /> Report Security Issue
                </a>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="menu_book" /> Documentation</h3>
                  <Tooltip content="View the project documentation, including how to contribute, our security policy, and support options." position="right" maxWidth={350}>
                    <span className="info-icon" aria-label="More information">i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">View documentation and support resources</p>
                <div className="export-buttons">
                  <a 
                    href="https://github.com/mbianchidev/fire-tools/blob/main/README.md" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="secondary-btn external-link-btn"
                  >
                    <MaterialIcon name="open_in_new" /> README
                  </a>
                  <a 
                    href="https://github.com/mbianchidev/fire-tools/blob/main/CONTRIBUTING.md" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="secondary-btn external-link-btn"
                  >
                    <MaterialIcon name="open_in_new" /> Contributing Guide
                  </a>
                  <a 
                    href="https://github.com/mbianchidev/fire-tools/blob/main/SUPPORT.md" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="secondary-btn external-link-btn"
                  >
                    <MaterialIcon name="open_in_new" /> Support
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
      
      {/* Category Manager Dialog */}
      {showCategoryManager && expenseData && (
        <CategoryManagerDialog
          customCategories={expenseData.customCategories || []}
          categoryOverrides={expenseData.categoryOverrides || []}
          onAddCategory={handleAddCategory}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onUpdateBuiltInCategory={handleUpdateBuiltInCategory}
          onClose={() => setShowCategoryManager(false)}
          getExpenseCountForCategory={getExpenseCountForCategory}
        />
      )}
    </div>
  );
};
