import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, DEFAULT_FIRE_ASSET_CLASS_INCLUSION, DEFAULT_BACKEND_SETTINGS, type UserSettings, type BackendSettings } from '../utils/cookieSettings';
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
import { ensureNativeNotificationPermission, showNativeNotification } from '../utils/nativeNotifications';
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
import { LanguageSelector } from './LanguageSelector';
import { probeBackend, getEmbeddedBackendInfo, getApiBaseUrl } from '../utils/apiBase';
import { API_ENDPOINTS, type ApiEndpoint } from '../utils/apiCatalog';
import { IS_DEMO_MODE } from '../utils/demoMode';
import { AboutSection } from './AboutSection';
import './SettingsPage.css';

interface SettingsPageProps {
  onSettingsChange?: (settings: UserSettings) => void;
}

// Section identifiers for collapsible state
const SETTINGS_SECTIONS = ['language', 'account', 'fire', 'display', 'privacy', 'backend', 'advanced', 'experimental', 'notifications', 'email', 'disclaimer', 'currency', 'marketData', 'categories', 'data', 'support', 'about'] as const;
type SettingsSection = typeof SETTINGS_SECTIONS[number];

export const SettingsPage: React.FC<SettingsPageProps> = ({ onSettingsChange }) => {
  const { t } = useTranslation();
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

  // Backend connection state
  const [backendDraftUrl, setBackendDraftUrl] = useState<string>('');
  const [backendTestState, setBackendTestState] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ status: 'idle' });
  const [embeddedBackendUrl, setEmbeddedBackendUrl] = useState<string | null>(null);
  const [embeddedBackendError, setEmbeddedBackendError] = useState<string | null>(null);
  const isElectron = typeof window !== 'undefined' && !!window.fireTools?.getEmbeddedBackend;

  // API explorer state (advanced settings)
  const [apiSelectedIndex, setApiSelectedIndex] = useState<number>(0);
  const [apiPath, setApiPath] = useState<string>(API_ENDPOINTS[0]?.path ?? '/health');
  const [apiMethod, setApiMethod] = useState<ApiEndpoint['method']>(API_ENDPOINTS[0]?.method ?? 'GET');
  const [apiBody, setApiBody] = useState<string>('');
  const [apiResponse, setApiResponse] = useState<{ status: number; body: string; ms: number } | null>(null);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
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

  // Seed backend draft URL from loaded settings & fetch embedded info
  useEffect(() => {
    setBackendDraftUrl(settings.backend?.customUrl ?? '');
  }, [settings.backend?.customUrl]);

  useEffect(() => {
    if (!isElectron) return;
    let cancelled = false;
    (async () => {
      const info = await getEmbeddedBackendInfo();
      if (cancelled) return;
      if (info?.error) {
        setEmbeddedBackendError(info.error);
        setEmbeddedBackendUrl(null);
      } else if (info?.url) {
        setEmbeddedBackendUrl(info.url);
        setEmbeddedBackendError(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isElectron]);

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
    showMessage('success', t('settings.messages.categoryAdded', { name: category.name }));
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
    showMessage('success', t('settings.messages.categoryUpdatedWithName', { name: category.name }));
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
    showMessage('success', t('settings.messages.categoryDeleted', { name: category?.name || t('common.unknown') }));
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
    showMessage('success', t('settings.messages.categoryUpdated'));
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
    showMessage('success', t('settings.messages.settingsSaved'));
  };

  // Backend mode change
  const handleBackendModeChange = (mode: BackendSettings['mode']) => {
    const next: BackendSettings = mode === 'custom'
      ? { mode: 'custom', customUrl: settings.backend?.customUrl ?? backendDraftUrl ?? '' }
      : { mode: 'embedded' };
    handleSettingChange('backend', next);
    setBackendTestState({ status: 'idle' });
  };

  // Save custom URL (commit draft)
  const handleSaveBackendUrl = () => {
    const trimmed = backendDraftUrl.trim();
    if (!trimmed) {
      showMessage('error', t('settings.backend.urlRequired'));
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      showMessage('error', t('settings.backend.urlInvalid'));
      return;
    }
    handleSettingChange('backend', { mode: 'custom', customUrl: trimmed });
  };

  // Test backend connection (uses draft URL when in custom mode, else embedded)
  const handleTestBackend = async () => {
    setBackendTestState({ status: 'testing' });
    let origin: string | null = null;
    const mode = settings.backend?.mode ?? 'embedded';
    if (mode === 'custom') {
      const trimmed = backendDraftUrl.trim();
      if (!trimmed) {
        setBackendTestState({ status: 'error', message: t('settings.backend.urlRequired') });
        return;
      }
      try { new URL(trimmed); } catch {
        setBackendTestState({ status: 'error', message: t('settings.backend.urlInvalid') });
        return;
      }
      origin = trimmed;
    } else {
      if (!embeddedBackendUrl) {
        setBackendTestState({ status: 'error', message: embeddedBackendError || t('settings.backend.embeddedUnavailable') });
        return;
      }
      origin = embeddedBackendUrl;
    }
    try {
      await probeBackend(origin);
      setBackendTestState({ status: 'success', message: t('settings.backend.testSuccess') });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBackendTestState({ status: 'error', message: `${t('settings.backend.testError')}: ${msg}` });
    }
  };

  // API explorer: send arbitrary request to embedded/custom backend
  const handleApiSelect = (idx: number) => {
    const ep = API_ENDPOINTS[idx];
    if (!ep) return;
    setApiSelectedIndex(idx);
    setApiPath(ep.path);
    setApiMethod(ep.method);
    setApiBody('');
    setApiResponse(null);
    setApiError(null);
  };

  const handleApiSend = async () => {
    setApiBusy(true);
    setApiError(null);
    setApiResponse(null);
    try {
      const base = await getApiBaseUrl();
      if (!base) {
        setApiError(t('settings.advanced.noBackend'));
        return;
      }
      const trimmedPath = apiPath.trim();
      if (!trimmedPath.startsWith('/')) {
        setApiError(t('settings.advanced.pathMustStartWithSlash'));
        return;
      }
      let bodyPayload: string | undefined;
      if (apiMethod !== 'GET' && apiMethod !== 'DELETE' && apiBody.trim()) {
        try {
          JSON.parse(apiBody);
          bodyPayload = apiBody;
        } catch {
          setApiError(t('settings.advanced.invalidJson'));
          return;
        }
      }
      const started = performance.now();
      const res = await fetch(`${base}${trimmedPath}`, {
        method: apiMethod,
        headers: bodyPayload ? { 'Content-Type': 'application/json' } : undefined,
        body: bodyPayload,
      });
      const ms = Math.round(performance.now() - started);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON; show as-is
      }
      setApiResponse({ status: res.status, body: pretty, ms });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setApiBusy(false);
    }
  };

  // Handle fallback rate change
  const handleFallbackRateChange = (currency: SupportedCurrency, rate: number) => {
    if (rate <= 0) {
      showMessage('error', t('settings.messages.ratePositive'));
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
    showMessage('success', t('settings.messages.rateUpdated', { currency }));
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
      showMessage('error', result.errorMessage || t('settings.messages.ratePositive'));
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
    showMessage('success', t('settings.messages.fallbackRatesReset'));
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
      
      showMessage('success', t('settings.messages.allDataExportedJson'));
    } catch (error) {
      showMessage('error', t('settings.messages.exportFailed', { message: error instanceof Error ? error.message : t('common.unknownError') }));
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

      showMessage('success', t('settings.messages.dataExportedSeparate'));
    } catch (error) {
      showMessage('error', t('settings.messages.exportFailed', { message: error instanceof Error ? error.message : t('common.unknownError') }));
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
        
        showMessage('success', t('settings.messages.allDataImported'));
      } catch (error) {
        showMessage('error', t('settings.messages.importFailed', { message: error instanceof Error ? error.message : t('common.unknownError') }));
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
        showMessage('success', t('settings.messages.fireImported'));
      } catch (error) {
        showMessage('error', t('settings.messages.importFailed', { message: error instanceof Error ? error.message : t('common.unknownError') }));
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
        showMessage('success', t('settings.messages.assetAllocationImported'));
      } catch (error) {
        showMessage('error', t('settings.messages.importFailed', { message: error instanceof Error ? error.message : t('common.unknownError') }));
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
        showMessage('success', t('settings.messages.cashflowImported'));
      } catch (error) {
        showMessage('error', t('settings.messages.importFailed', { message: error instanceof Error ? error.message : t('common.unknownError') }));
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
        showMessage('success', t('settings.messages.netWorthImported'));
      } catch (error) {
        showMessage('error', t('settings.messages.importFailed', { message: error instanceof Error ? error.message : t('common.unknownError') }));
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Reset all data
  const handleResetAll = () => {
    if (confirm(t('settings.confirm.resetAll'))) {
      clearAllData();
      showMessage('success', t('settings.messages.allDataReset'));
    }
  };

  // Load demo data
  const handleLoadDemoData = () => {
    if (confirm(t('settings.confirm.loadDemo'))) {
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
        
        showMessage('success', t('settings.messages.demoLoaded'));
      } catch (error) {
        showMessage('error', t('settings.messages.demoLoadFailed', { message: error instanceof Error ? error.message : t('common.unknownError') }));
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
    showMessage('success', t('settings.messages.notificationPreferencesSaved'));

    // When the user opts in to native OS notifications, prompt the browser
    // for permission so the very next notification can actually fire. In
    // Electron this is a no-op (permission is granted by the OS).
    if (key === 'enableNativeNotifications' && value === true) {
      void ensureNativeNotificationPermission();
    }
  };

  // Clear all notifications
  const handleClearNotifications = () => {
    if (confirm(t('settings.confirm.clearNotifications'))) {
      clearNotifications();
      showMessage('success', t('settings.messages.notificationsCleared'));
    }
  };

  // Trigger test notifications
  const handleTriggerTestNotifications = async () => {
    // If the user has native notifications enabled but hasn't granted
    // browser permission yet, request it now so the test actually fires
    // a visible OS toast (Electron grants this implicitly).
    if (notificationPrefs.enableNativeNotifications) {
      await ensureNativeNotificationPermission();
    }

    const testNotifications = generateDemoTourNotifications();
    testNotifications.forEach(notification => {
      addNotification(notification);
    });

    // Additionally fire one explicit native-only ping so the user can
    // confirm the OS-level path works even if they have in-app disabled.
    if (notificationPrefs.enableNativeNotifications) {
      void showNativeNotification({
        title: t('settings.testNotificationNativeTitle'),
        message: t('settings.testNotificationNativeBody'),
        priority: 'MEDIUM',
      });
    }

    showMessage('success', t('settings.messages.testNotificationsCreated', { count: testNotifications.length }));
  };

  if (isLoading) {
    return <div className="settings-page loading">{t('settings.loadingSettings')}</div>;
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <button className="back-button" onClick={() => navigate(-1)}>
            {t('settings.back')}
          </button>
          <h1><MaterialIcon name="settings" /> {t('settings.title')}</h1>
        </div>

        {message && (
          <div className={`settings-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Language Settings */}
        <section className="settings-section collapsible-section">
          <button
            className="collapsible-header"
            onClick={() => toggleSection('language')}
            aria-expanded={!collapsedSections.has('language')}
            aria-controls="language-content"
          >
            <h2><MaterialIcon name="language" /> {t('settings.language')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('language') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('language') && (
            <div id="language-content" className="collapsible-content">
              <LanguageSelector />
            </div>
          )}
        </section>

        {/* Account Settings */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('account')}
            aria-expanded={!collapsedSections.has('account')}
            aria-controls="account-content"
          >
            <h2><MaterialIcon name="person" /> {t('settings.sections.account')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('account') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('account') && (
            <div id="account-content" className="collapsible-content">
              <div className="setting-item account-name-setting">
                <div className="label-with-tooltip">
                  <label htmlFor="accountName">{t('settings.accountName')}</label>
                  <Tooltip content={t('settings.tooltips.accountName')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <input
                  id="accountName"
                  type="text"
                  value={settings.accountName}
                  onChange={(e) => handleSettingChange('accountName', e.target.value)}
                  maxLength={100}
                  placeholder={t('settings.placeholders.myPortfolio')}
                  className="account-name-input"
                />
                <span className="setting-help">{t('settings.accountNameHelp')}</span>
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
            <h2><MaterialIcon name="local_fire_department" /> {t('settings.sections.fire')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('fire') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('fire') && (
            <div id="fire-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>{t('settings.fireAssetClassesIncluded')}</label>
                  <Tooltip content={t('settings.tooltips.fireAssetClasses')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <span className="setting-help">{t('settings.fireAssetClassesHelp')}</span>
                <div className="fire-asset-class-grid">
                  {(Object.keys(settings.fireAssetClassInclusion) as AssetClass[]).map(ac => (
                    <label key={ac} className="toggle-switch-label fire-asset-checkbox">
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
                      <span className="toggle-switch"></span>
                      <span>{formatAssetName(ac)}</span>
                    </label>
                  ))}
                </div>
                <button
                  className="secondary-btn btn-small"
                  onClick={() => handleSettingChange('fireAssetClassInclusion', DEFAULT_FIRE_ASSET_CLASS_INCLUSION)}
                  style={{ marginTop: '0.5rem' }}
                >
                  {t('common.resetToDefaults')}
                </button>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label className="toggle-switch-label">
                    <input
                      type="checkbox"
                      checked={settings.includePrimaryResidenceInFIRE ?? true}
                      onChange={(e) => handleSettingChange('includePrimaryResidenceInFIRE', e.target.checked)}
                    />
                    <span className="toggle-switch"></span>
                    <span>{t('settings.includePrimaryResidence')}</span>
                  </label>
                  <Tooltip content={t('settings.tooltips.primaryResidence')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <span className="setting-help">{t('settings.primaryResidenceHelp')}</span>
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
            <h2><MaterialIcon name="palette" /> {t('settings.sections.display')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('display') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('display') && (
            <div id="display-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="defaultCurrency">{t('settings.defaultCurrency')}</label>
                  <Tooltip content={t('settings.tooltips.defaultCurrency')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
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
                    showMessage('success', t('settings.messages.defaultCurrencyChanged', { currency: newCurrency }));
                  }}
                  ariaLabel={t('settings.defaultCurrency')}
                />
                <span className="setting-help">{t('settings.defaultCurrencyHelp')}</span>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>{t('settings.decimalSeparator')}</label>
                  <Tooltip content={t('settings.tooltips.decimalSeparator')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${settings.decimalSeparator === '.' ? 'active' : ''}`}
                    onClick={() => handleSettingChange('decimalSeparator', '.')}
                  >
                    {t('settings.pointFormat')}
                  </button>
                  <button
                    className={`toggle-btn ${settings.decimalSeparator === ',' ? 'active' : ''}`}
                    onClick={() => handleSettingChange('decimalSeparator', ',')}
                  >
                    {t('settings.commaFormat')}
                  </button>
                </div>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="decimalPlaces">{t('settings.decimalPlaces')}</label>
                  <Tooltip content={t('settings.tooltips.decimalPlaces')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <select
                  id="decimalPlaces"
                  value={settings.decimalPlaces ?? 2}
                  onChange={(e) => handleSettingChange('decimalPlaces', parseInt(e.target.value, 10))}
                >
                  <option value={0}>{t('settings.decimalPlaceOptions.zero')}</option>
                  <option value={1}>{t('settings.decimalPlaceOptions.one')}</option>
                  <option value={2}>{t('settings.decimalPlaceOptions.two')}</option>
                  <option value={3}>{t('settings.decimalPlaceOptions.three')}</option>
                  <option value={4}>{t('settings.decimalPlaceOptions.four')}</option>
                </select>
                <span className="setting-help">{t('settings.decimalPlacesHelp')}</span>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="dateFormat">{t('settings.dateFormat')}</label>
                  <Tooltip content={t('settings.tooltips.dateFormat')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <select
                  id="dateFormat"
                  value={settings.dateFormat ?? 'DD/MM/YYYY'}
                  onChange={(e) => handleSettingChange('dateFormat', e.target.value as 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD')}
                >
                  <option value="DD/MM/YYYY">{t('settings.dateFormatOptions.dmy')}</option>
                  <option value="MM/DD/YYYY">{t('settings.dateFormatOptions.mdy')}</option>
                  <option value="YYYY-MM-DD">{t('settings.dateFormatOptions.iso')}</option>
                </select>
                <span className="setting-help">{t('settings.dateFormatHelp')}</span>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="searchThreshold">{t('settings.searchThreshold')}</label>
                  <Tooltip content={t('settings.tooltips.searchThreshold')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <select
                  id="searchThreshold"
                  value={settings.searchThreshold ?? 8}
                  onChange={(e) => handleSettingChange('searchThreshold', parseInt(e.target.value, 10))}
                >
                  <option value={0}>{t('settings.searchThresholdOptions.always')}</option>
                  <option value={4}>{t('settings.searchThresholdOptions.four')}</option>
                  <option value={6}>{t('settings.searchThresholdOptions.six')}</option>
                  <option value={8}>{t('settings.searchThresholdOptions.eight')}</option>
                  <option value={10}>{t('settings.searchThresholdOptions.ten')}</option>
                  <option value={15}>{t('settings.searchThresholdOptions.fifteen')}</option>
                  <option value={999}>{t('settings.searchThresholdOptions.never')}</option>
                </select>
                <span className="setting-help">{t('settings.searchThresholdHelp')}</span>
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
            <h2><MaterialIcon name="privacy_tip" /> {t('settings.sections.privacy')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('privacy') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('privacy') && (
            <div id="privacy-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="privacyMode">{t('settings.privacyMode')}</label>
                  <Tooltip content={t('settings.tooltips.privacyMode')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${!settings.privacyMode ? 'active' : ''}`}
                    onClick={() => handleSettingChange('privacyMode', false)}
                  >
                    <MaterialIcon name="visibility" size="small" /> {t('common.showValues')}
                  </button>
                  <button
                    className={`toggle-btn ${settings.privacyMode ? 'active' : ''}`}
                    onClick={() => handleSettingChange('privacyMode', true)}
                  >
                    <MaterialIcon name="visibility_off" size="small" /> {t('common.hideValues')}
                  </button>
                </div>
                <span className="setting-help">{t('settings.privacyModeHelp')}</span>
              </div>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="country">{t('settings.country')}</label>
                  <Tooltip content={t('settings.tooltips.country')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <SearchableSelect
                  options={[
                    { id: '', label: t('settings.selectCountryOptional') },
                    ...ALL_COUNTRIES.map(c => ({
                      id: c.code,
                      label: `${c.flag} ${c.name}`,
                    }))
                  ]}
                  value={settings.country || ''}
                  onChange={(val) => handleSettingChange('country', val || undefined)}
                  searchThreshold={settings.searchThreshold ?? 8}
                  ariaLabel={t('settings.country')}
                />
                {(() => {
                  const isEU = settings.country && isEUCountry(settings.country);
                  if (isEU) {
                    return (
                      <span className="setting-help eu-notice">
                        <MaterialIcon name="info" size="small" /> {t('settings.euResidentNotice')}
                      </span>
                    );
                  } else if (settings.country) {
                    return (
                      <span className="setting-help">{t('settings.countrySetTo', { country: ALL_COUNTRIES.find(c => c.code === settings.country)?.name })}</span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}
        </section>

        {/* Backend */}
        <section className="settings-section collapsible-section">
          <button
            className="collapsible-header"
            onClick={() => toggleSection('backend')}
            aria-expanded={!collapsedSections.has('backend')}
            aria-controls="backend-content"
          >
            <h2><MaterialIcon name="dns" /> {t('settings.sections.backend')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('backend') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('backend') && (
            <div id="backend-content" className="collapsible-content">
              <p className="setting-help">{t('settings.backend.description')}</p>

              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>{t('settings.backend.mode')}</label>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${(settings.backend?.mode ?? DEFAULT_BACKEND_SETTINGS.mode) === 'embedded' ? 'active' : ''}`}
                    onClick={() => handleBackendModeChange('embedded')}
                    disabled={!isElectron}
                    title={!isElectron ? t('settings.backend.embeddedOnlyDesktop') : undefined}
                  >
                    <MaterialIcon name="memory" size="small" /> {t('settings.backend.embedded')}
                  </button>
                  <button
                    className={`toggle-btn ${(settings.backend?.mode ?? DEFAULT_BACKEND_SETTINGS.mode) === 'custom' ? 'active' : ''}`}
                    onClick={() => handleBackendModeChange('custom')}
                  >
                    <MaterialIcon name="cloud" size="small" /> {t('settings.backend.custom')}
                  </button>
                </div>
              </div>

              {(settings.backend?.mode ?? DEFAULT_BACKEND_SETTINGS.mode) === 'embedded' ? (
                <div className="setting-item">
                  <span className="setting-help">
                    {isElectron
                      ? (embeddedBackendError
                        ? `${t('settings.backend.embeddedUnavailable')}: ${embeddedBackendError}`
                        : embeddedBackendUrl
                          ? `${t('settings.backend.embeddedRunningAt')}: ${embeddedBackendUrl}`
                          : t('settings.backend.embeddedStarting'))
                      : t('settings.backend.embeddedOnlyDesktop')}
                  </span>
                </div>
              ) : (
                <div className="setting-item">
                  <div className="label-with-tooltip">
                    <label htmlFor="backendCustomUrl">{t('settings.backend.customUrl')}</label>
                  </div>
                  <input
                    id="backendCustomUrl"
                    type="url"
                    value={backendDraftUrl}
                    onChange={(e) => setBackendDraftUrl(e.target.value)}
                    placeholder={t('settings.backend.customUrlPlaceholder')}
                  />
                  <div className="toggle-group" style={{ marginTop: '0.5rem' }}>
                    <button className="toggle-btn" onClick={handleSaveBackendUrl}>
                      <MaterialIcon name="save" size="small" /> {t('common.save')}
                    </button>
                  </div>
                  <span className="setting-help">{t('settings.backend.customUrlHelp')}</span>
                </div>
              )}

              <div className="setting-item">
                <div className="toggle-group">
                  <button
                    className="toggle-btn"
                    onClick={handleTestBackend}
                    disabled={backendTestState.status === 'testing'}
                  >
                    <MaterialIcon name="wifi_tethering" size="small" /> {backendTestState.status === 'testing' ? t('settings.backend.testing') : t('settings.backend.test')}
                  </button>
                </div>
                {backendTestState.status === 'success' && (
                  <span className="setting-help" style={{ color: 'var(--success-color, #22c55e)' }}>
                    <MaterialIcon name="check_circle" size="small" /> {backendTestState.message}
                  </span>
                )}
                {backendTestState.status === 'error' && (
                  <span className="setting-help" style={{ color: 'var(--error-color, #ef4444)' }}>
                    <MaterialIcon name="error" size="small" /> {backendTestState.message}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Advanced — API explorer */}
        <section className="settings-section collapsible-section">
          <button
            className="collapsible-header"
            onClick={() => toggleSection('advanced')}
            aria-expanded={!collapsedSections.has('advanced')}
            aria-controls="advanced-content"
          >
            <h2><MaterialIcon name="terminal" /> {t('settings.sections.advanced')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('advanced') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('advanced') && (
            <div id="advanced-content" className="collapsible-content">
              <p className="setting-help">{t('settings.advanced.description')}</p>

              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="apiEndpointSelect">{t('settings.advanced.endpoint')}</label>
                </div>
                <select
                  id="apiEndpointSelect"
                  value={apiSelectedIndex}
                  onChange={(e) => handleApiSelect(Number(e.target.value))}
                >
                  {API_ENDPOINTS.map((ep, idx) => (
                    <option key={`${ep.method}-${ep.path}`} value={idx}>
                      {ep.method} {ep.path} — {ep.summary}
                    </option>
                  ))}
                </select>
              </div>

              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="apiMethodInput">{t('settings.advanced.method')}</label>
                </div>
                <select
                  id="apiMethodInput"
                  value={apiMethod}
                  onChange={(e) => setApiMethod(e.target.value as ApiEndpoint['method'])}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>

              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="apiPathInput">{t('settings.advanced.path')}</label>
                </div>
                <input
                  id="apiPathInput"
                  type="text"
                  value={apiPath}
                  onChange={(e) => setApiPath(e.target.value)}
                  placeholder="/health"
                />
                <span className="setting-help">{t('settings.advanced.pathHelp')}</span>
              </div>

              {(apiMethod === 'POST' || apiMethod === 'PUT' || apiMethod === 'PATCH') && (
                <div className="setting-item">
                  <div className="label-with-tooltip">
                    <label htmlFor="apiBodyInput">{t('settings.advanced.body')}</label>
                  </div>
                  <textarea
                    id="apiBodyInput"
                    value={apiBody}
                    onChange={(e) => setApiBody(e.target.value)}
                    placeholder='{"key": "value"}'
                    rows={4}
                  />
                </div>
              )}

              <div className="setting-item">
                <div className="toggle-group">
                  <button
                    className="toggle-btn"
                    onClick={handleApiSend}
                    disabled={apiBusy}
                  >
                    <MaterialIcon name="send" size="small" /> {apiBusy ? t('settings.advanced.sending') : t('settings.advanced.send')}
                  </button>
                </div>
                {apiError && (
                  <span className="setting-help" style={{ color: 'var(--error-color, #ef4444)' }}>
                    <MaterialIcon name="error" size="small" /> {apiError}
                  </span>
                )}
              </div>

              {apiResponse && (
                <div className="setting-item">
                  <div className="label-with-tooltip">
                    <label>
                      {t('settings.advanced.response')} —{' '}
                      <span style={{ color: apiResponse.status >= 200 && apiResponse.status < 300 ? 'var(--success-color, #22c55e)' : 'var(--error-color, #ef4444)' }}>
                        {apiResponse.status}
                      </span>{' '}
                      <span style={{ color: 'var(--text-secondary, #888)' }}>({apiResponse.ms}ms)</span>
                    </label>
                  </div>
                  <pre
                    style={{
                      maxHeight: '300px',
                      overflow: 'auto',
                      padding: '0.75rem',
                      background: 'var(--bg-secondary, #1a1a1a)',
                      border: '1px solid var(--border-color, #333)',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {apiResponse.body || '(empty)'}
                  </pre>
                </div>
              )}
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
            <h2><MaterialIcon name="science" /> {t('settings.sections.experimental')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('experimental') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('experimental') && (
            <div id="experimental-content" className="collapsible-content">
              <p className="setting-help" style={{ marginBottom: '1rem' }}>
                <MaterialIcon name="warning" size="small" /> {t('settings.experimentalPreviewWarning')}
              </p>
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="experimentalPortfolioBreakdown">{t('settings.portfolioBreakdownPage')}</label>
                  <Tooltip content={t('settings.tooltips.portfolioBreakdown')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${!settings.experimentalFeatures?.portfolioBreakdown ? 'active' : ''}`}
                    onClick={() => handleSettingChange('experimentalFeatures', { ...settings.experimentalFeatures, portfolioBreakdown: false })}
                  >
                    {t('settings.disabled')}
                  </button>
                  <button
                    className={`toggle-btn ${settings.experimentalFeatures?.portfolioBreakdown ? 'active' : ''}`}
                    onClick={() => handleSettingChange('experimentalFeatures', { ...settings.experimentalFeatures, portfolioBreakdown: true })}
                  >
                    {t('settings.enabled')}
                  </button>
                </div>
                <span className="setting-help">{t('settings.portfolioBreakdownHelp')}</span>
              </div>

              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label htmlFor="experimentalPdfImport">{t('settings.pdfImport')}</label>
                  <Tooltip content={t('settings.tooltips.pdfImport')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${!settings.experimentalFeatures?.pdfImport ? 'active' : ''}`}
                    onClick={() => handleSettingChange('experimentalFeatures', { ...settings.experimentalFeatures, pdfImport: false })}
                  >
                    {t('settings.disabled')}
                  </button>
                  <button
                    className={`toggle-btn ${settings.experimentalFeatures?.pdfImport ? 'active' : ''}`}
                    onClick={() => handleSettingChange('experimentalFeatures', { ...settings.experimentalFeatures, pdfImport: true })}
                  >
                    {t('settings.enabled')}
                  </button>
                </div>
                <span className="setting-help">{t('settings.pdfImportHelp')}</span>
              </div>

              {settings.experimentalFeatures?.pdfImport && (
                <div className="setting-item">
                  <div className="label-with-tooltip">
                    <label>{t('settings.aiCategorizationOptional')}</label>
                    <Tooltip content={t('settings.tooltips.aiCategorization')}>
                      <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                    </Tooltip>
                  </div>
                  <p className="setting-help" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                    {t('settings.aiCategorizationHelp')}
                  </p>
                  <div className="form-group">
                    <label htmlFor="llmBaseUrl">{t('settings.baseUrl')}</label>
                    <input
                      id="llmBaseUrl"
                      type="text"
                      placeholder={t('settings.placeholders.llmBaseUrl')}
                      value={settings.llmCategorization?.baseUrl ?? ''}
                      onChange={(e) => handleSettingChange('llmCategorization', {
                        baseUrl: e.target.value,
                        apiKey: settings.llmCategorization?.apiKey ?? '',
                        model: settings.llmCategorization?.model ?? '',
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="llmApiKey">{t('settings.apiKey')}</label>
                    <input
                      id="llmApiKey"
                      type="password"
                      placeholder={t('settings.placeholders.apiKey')}
                      value={settings.llmCategorization?.apiKey ?? ''}
                      onChange={(e) => handleSettingChange('llmCategorization', {
                        baseUrl: settings.llmCategorization?.baseUrl ?? '',
                        apiKey: e.target.value,
                        model: settings.llmCategorization?.model ?? '',
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="llmModel">{t('settings.model')}</label>
                    <input
                      id="llmModel"
                      type="text"
                      placeholder={t('settings.placeholders.llmModel')}
                      value={settings.llmCategorization?.model ?? ''}
                      onChange={(e) => handleSettingChange('llmCategorization', {
                        baseUrl: settings.llmCategorization?.baseUrl ?? '',
                        apiKey: settings.llmCategorization?.apiKey ?? '',
                        model: e.target.value,
                      })}
                    />
                  </div>
                  <span className="setting-help">
                    {t('settings.aiCategorizationStoredHelp')}
                  </span>
                </div>
              )}
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
            <h2><MaterialIcon name="notifications" /> {t('settings.sections.notifications')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('notifications') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('notifications') && (
            <div id="notifications-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>{t('settings.enableInAppNotifications')}</label>
                  <Tooltip content={t('settings.tooltips.inAppNotifications')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${notificationPrefs.enableInAppNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableInAppNotifications', true)}
                  >
                    {t('settings.enabled')}
                  </button>
                  <button
                    className={`toggle-btn ${!notificationPrefs.enableInAppNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableInAppNotifications', false)}
                  >
                    {t('settings.disabled')}
                  </button>
                </div>
              </div>

              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>{t('settings.enableNativeNotifications')}</label>
                  <Tooltip content={t('settings.tooltips.nativeNotifications')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${notificationPrefs.enableNativeNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableNativeNotifications', true)}
                  >
                    {t('settings.enabled')}
                  </button>
                  <button
                    className={`toggle-btn ${!notificationPrefs.enableNativeNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableNativeNotifications', false)}
                  >
                    {t('settings.disabled')}
                  </button>
                </div>
                <span className="setting-help">{t('settings.enableNativeNotificationsHelp')}</span>
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
                      <span>{t('settings.newMonthReminders')}</span>
                    </label>
                    <span className="setting-help">{t('settings.newMonthRemindersHelp')}</span>
                  </div>

                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.newQuarterReminders}
                        onChange={(e) => handleNotificationPrefChange('newQuarterReminders', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>{t('settings.newQuarterReminders')}</span>
                    </label>
                    <span className="setting-help">{t('settings.newQuarterRemindersHelp')}</span>
                  </div>

                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.taxReminders}
                        onChange={(e) => handleNotificationPrefChange('taxReminders', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>{t('settings.taxPaymentReminders')}</span>
                    </label>
                    <span className="setting-help">{t('settings.taxPaymentRemindersHelp')}</span>
                  </div>

                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.dcaReminders}
                        onChange={(e) => handleNotificationPrefChange('dcaReminders', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>{t('settings.dcaInvestmentReminders')}</span>
                    </label>
                    <span className="setting-help">{t('settings.dcaInvestmentRemindersHelp')}</span>
                  </div>

                  <div className="setting-item">
                    <label className="toggle-switch-label">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.fireMilestones}
                        onChange={(e) => handleNotificationPrefChange('fireMilestones', e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      <span>{t('settings.fireMilestoneAlerts')}</span>
                    </label>
                    <span className="setting-help">{t('settings.fireMilestoneAlertsHelp')}</span>
                  </div>
                </>
              )}

              <div className="setting-item">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="science" /> {t('settings.testMode')}</h3>
                  <Tooltip content={t('settings.tooltips.testMode')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.testModeHelp')}</p>
                <button className="secondary-btn" onClick={handleTriggerTestNotifications}>
                  <MaterialIcon name="notifications_active" /> {t('settings.triggerTestNotifications')}
                </button>
              </div>

              <div className="setting-item">
                <button className="secondary-btn" onClick={handleClearNotifications}>
                  <MaterialIcon name="delete" /> {t('settings.clearAllNotifications')}
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
            <h2><MaterialIcon name="email" /> {t('settings.sections.email')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('email') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('email') && (
            <div id="email-content" className="collapsible-content">
              <div className="setting-item">
                <div className="label-with-tooltip">
                  <label>{t('settings.emailNotifications')}</label>
                  <Tooltip content={t('settings.tooltips.emailNotifications')}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <div className="toggle-group">
                  <button
                    className={`toggle-btn ${notificationPrefs.enableEmailNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableEmailNotifications', true)}
                    disabled
                  >
                    {t('settings.enabled')}
                  </button>
                  <button
                    className={`toggle-btn ${!notificationPrefs.enableEmailNotifications ? 'active' : ''}`}
                    onClick={() => handleNotificationPrefChange('enableEmailNotifications', false)}
                  >
                    {t('settings.disabled')}
                  </button>
                </div>
                <span className="setting-help">{t('settings.emailNotificationsUnavailable')}</span>
              </div>

              {notificationPrefs.enableEmailNotifications && (
                <>
                  <div className="setting-item">
                    <label htmlFor="emailAddress">{t('settings.emailAddress')}</label>
                    <input
                      id="emailAddress"
                      type="email"
                      value={notificationPrefs.emailAddress}
                      onChange={(e) => handleNotificationPrefChange('emailAddress', e.target.value)}
                      placeholder={t('settings.placeholders.email')}
                      disabled
                    />
                  </div>

                  <div className="setting-item">
                    <label htmlFor="emailFrequency">{t('settings.emailFrequency')}</label>
                    <select
                      id="emailFrequency"
                      value={notificationPrefs.emailFrequency}
                      onChange={(e) => handleNotificationPrefChange('emailFrequency', e.target.value as NotificationPreferences['emailFrequency'])}
                      disabled
                    >
                      <option value="NEVER">{t('settings.frequency.never')}</option>
                      <option value="DAILY">{t('settings.frequency.daily')}</option>
                      <option value="WEEKLY">{t('settings.frequency.weekly')}</option>
                      <option value="MONTHLY">{t('settings.frequency.monthly')}</option>
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
              <MaterialIcon name="currency_exchange" /> {t('settings.sections.currency')}
              <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('currency') ? '▶' : '▼'}</span>
            </h2>
          </button>
          {!collapsedSections.has('currency') && (
            <div id="currency-content" className="collapsible-content">
              <div className="exchange-rate-warning">
                <MaterialIcon name="warning" />
                <p>
                  {t('settings.exchangeRateWarning')}
                </p>
              </div>
              
              <div className="subsection-header-with-tooltip">
                <h3>{t('settings.fallbackRates')}</h3>
                <Tooltip content={t('settings.tooltips.fallbackRates')} position="right" maxWidth={350}>
                  <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                </Tooltip>
              </div>
              <p className="section-description">
                {t('settings.fallbackRatesDescription', { currency: settings.currencySettings.defaultCurrency })}
              </p>
              <div className="fallback-rates-grid">
                {SUPPORTED_CURRENCIES.filter(c => c.code !== settings.currencySettings.defaultCurrency).map((currency) => (
                  <div key={currency.code} className="rate-item">
                    <label htmlFor={`rate-${currency.code}`}>
                      {currency.code} ({currency.name})
                    </label>
                    <div className="rate-input-wrapper">
                      <span className="rate-prefix">{t('settings.oneCurrencyEquals', { currency: currency.code })}</span>
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
                {t('settings.resetToDefaultRates')}
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
              <MaterialIcon name="trending_up" /> {t('settings.sections.marketData')}
              <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('marketData') ? '▶' : '▼'}</span>
            </h2>
          </button>
          {!collapsedSections.has('marketData') && (
            <div id="marketdata-content" className="collapsible-content">
              <div className="market-data-disclaimer" role="note">
                <MaterialIcon name="info" />
                <div>
                  <strong>{t('settings.disclaimer')}</strong>
                  <p>
                    {t('settings.marketDataDisclaimer')}
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
                  {isMarketDataLoading ? t('settings.fetching') : t('settings.fetchCurrentMarketData')}
                </button>
                {marketDataFetchedAt && (
                  <span className="setting-help">
                    {t('settings.lastFetched')} {new Date(marketDataFetchedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Exchange Rates */}
              {marketDataRates && (
                <div className="setting-item">
                  <h3>{t('settings.exchangeRates')}</h3>
                  {marketDataRates.error && (
                    <div className="exchange-rate-warning">
                      <MaterialIcon name="warning" />
                      <p>{marketDataRates.error}</p>
                    </div>
                  )}
                  <p className="section-description">
                    {marketDataRates.isUsingFallback
                      ? t('settings.usingFallbackRates')
                      : t('settings.liveRatesFetchedAt', { date: new Date(marketDataRates.lastUpdate).toLocaleString() })}
                  </p>
                  <table className="market-data-table">
                    <thead>
                      <tr>
                        <th>{t('settings.currency')}</th>
                        <th>{t('settings.rateTo', { currency: settings.currencySettings.defaultCurrency })}</th>
                        <th>{t('settings.source')}</th>
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
                              {isLive ? t('settings.live') : t('settings.fallback')}
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
                  <h3>{t('settings.assetPrices')}</h3>
                  <p className="section-description">
                    {t('settings.assetPricesDescription')}
                  </p>
                  <table className="market-data-table">
                    <thead>
                      <tr>
                        <th>{t('settings.ticker')}</th>
                        <th>{t('settings.price')}</th>
                        <th>{t('settings.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(marketDataPrices).sort(([a], [b]) => a.localeCompare(b)).map(([ticker, price]) => (
                        <tr key={ticker}>
                          <td><strong>{ticker}</strong></td>
                          <td>{price !== null ? price.toFixed(2) : 'N/A'}</td>
                          <td className={price !== null ? 'market-data-live' : 'market-data-fallback'}>
                            {price !== null ? t('settings.available') : t('settings.unavailable')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!marketDataRates && Object.keys(marketDataPrices).length === 0 && !isMarketDataLoading && (
                <p className="section-description">
                  {t('settings.fetchMarketDataPrompt')}
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
            <h2><MaterialIcon name="category" /> {t('settings.sections.categories')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('categories') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('categories') && (
            <div id="categories-content" className="collapsible-content">
              <p className="setting-help">
                {t('settings.categoriesDescription')}
              </p>
              <div className="setting-group">
                <button className="primary-btn" onClick={handleOpenCategoryManager}>
                  <MaterialIcon name="category" size="small" />
                  {t('settings.manageCategories')}
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
            <h2><MaterialIcon name="save" /> {t('settings.sections.data')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('data') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('data') && (
            <div id="data-content" className="collapsible-content">
              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3>{t('settings.exportAllData')}</h3>
                  <Tooltip content={t('settings.tooltips.exportAllData')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.exportAllDataHelp')}</p>
                <div className="export-buttons">
                  <button className="primary-btn" onClick={handleExportAllJSON}>
                    <MaterialIcon name="download" /> {t('settings.exportJsonSingleFile')}
                  </button>
                  <button className="secondary-btn" onClick={handleExportAll}>
                    <MaterialIcon name="download" /> {t('settings.exportSeparateFiles')}
                  </button>
                </div>
              </div>

              {!IS_DEMO_MODE && (
              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3>{t('settings.importAllData')}</h3>
                  <Tooltip content={t('settings.tooltips.importAllData')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.importAllDataHelp')}</p>
                <label className="primary-btn import-label">
                  <MaterialIcon name="upload" /> {t('settings.importAllDataJson')}
                  <input type="file" accept=".json" onChange={handleImportAllJSON} hidden />
                </label>
              </div>
              )}

              {!IS_DEMO_MODE && (
              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3>{t('settings.importIndividualFiles')}</h3>
                  <Tooltip content={t('settings.tooltips.importIndividualFiles')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.importIndividualFilesHelp')}</p>
                <div className="import-buttons">
                  <label className="secondary-btn import-label">
                    <MaterialIcon name="upload" /> {t('settings.importFireCalculator')}
                    <input type="file" accept=".csv" onChange={handleImportFire} hidden />
                  </label>
                  <label className="secondary-btn import-label">
                    <MaterialIcon name="upload" /> {t('settings.importAssetAllocation')}
                    <input type="file" accept=".csv" onChange={handleImportAssets} hidden />
                  </label>
                  <label className="secondary-btn import-label">
                    <MaterialIcon name="upload" /> {t('settings.importCashflowTracker')}
                    <input type="file" accept=".csv" onChange={handleImportCashflow} hidden />
                  </label>
                  <label className="secondary-btn import-label">
                    <MaterialIcon name="upload" /> {t('settings.importNetWorthTracker')}
                    <input type="file" accept=".json" onChange={handleImportNetWorth} hidden />
                  </label>
                </div>
              </div>
              )}

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="school" /> {t('settings.guidedTour')}</h3>
                  <Tooltip content={t('settings.tooltips.guidedTour')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.guidedTourHelp')}</p>
                <button className="secondary-btn" onClick={() => {
                  clearTourPreference();
                  clearQuestionnairePromptPreference();
                  window.location.href = '/';
                }}>
                  <MaterialIcon name="refresh" /> {t('settings.restartTour')}
                </button>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="quiz" /> {t('settings.fireQuestionnaire')}</h3>
                  <Tooltip content={t('settings.tooltips.fireQuestionnaire')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.fireQuestionnaireHelp')}</p>
                <button className="secondary-btn" onClick={() => navigate('/questionnaire')}>
                  <MaterialIcon name="edit" /> {t('settings.retakeQuestionnaire')}
                </button>
              </div>

              {!IS_DEMO_MODE && (
              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="inventory_2" /> {t('settings.demoData')}</h3>
                  <Tooltip content={t('settings.tooltips.demoData')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.demoDataHelp')}</p>
                <button className="secondary-btn" onClick={handleLoadDemoData}>
                  <MaterialIcon name="sports_esports" /> {t('settings.loadDemoData')}
                </button>
              </div>
              )}

              {!IS_DEMO_MODE && (
              <div className="data-management-group danger-zone">
                <h3><MaterialIcon name="warning" /> {t('settings.dangerZone')}</h3>
                <p className="setting-help">{t('settings.actionCannotBeUndone')}</p>
                <button className="danger-btn" onClick={handleResetAll}>
                  <MaterialIcon name="delete" /> {t('settings.resetAllData')}
                </button>
              </div>
              )}
            </div>
          )}
        </section>

        {/* {t('settings.support')} & Feedback */}
        <section className="settings-section collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => toggleSection('support')}
            aria-expanded={!collapsedSections.has('support')}
            aria-controls="support-content"
          >
            <h2><MaterialIcon name="help" /> {t('settings.sections.support')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('support') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('support') && (
            <div id="support-content" className="collapsible-content">
              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="bug_report" /> {t('settings.reportBug')}</h3>
                  <Tooltip content={t('settings.tooltips.reportBug')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.reportBugHelp')}</p>
                <a 
                  href="https://github.com/mbianchidev/fire-tools/issues/new?template=bug_report.yml" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="secondary-btn external-link-btn"
                >
                  <MaterialIcon name="open_in_new" /> {t('settings.reportBug')}
                </a>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="lightbulb" /> {t('settings.requestFeature')}</h3>
                  <Tooltip content={t('settings.tooltips.requestFeature')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.requestFeatureHelp')}</p>
                <a 
                  href="https://github.com/mbianchidev/fire-tools/issues/new?template=feature_request.yml" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="secondary-btn external-link-btn"
                >
                  <MaterialIcon name="open_in_new" /> {t('settings.requestFeature')}
                </a>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="palette" /> {t('settings.uxUiSuggestion')}</h3>
                  <Tooltip content={t('settings.tooltips.uxUiSuggestion')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.uxUiSuggestionHelp')}</p>
                <a 
                  href="https://github.com/mbianchidev/fire-tools/issues/new?template=ux_ui_suggestion.yml" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="secondary-btn external-link-btn"
                >
                  <MaterialIcon name="open_in_new" /> {t('settings.suggestUxUiImprovement')}
                </a>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="security" /> {t('settings.reportSecurityIssue')}</h3>
                  <Tooltip content={t('settings.tooltips.reportSecurityIssue')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.reportSecurityIssueHelp')}</p>
                <a 
                  href="https://github.com/mbianchidev/fire-tools/security/advisories/new" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="secondary-btn external-link-btn"
                >
                  <MaterialIcon name="open_in_new" /> {t('settings.reportSecurityIssue')}
                </a>
              </div>

              <div className="data-management-group">
                <div className="subsection-header-with-tooltip">
                  <h3><MaterialIcon name="menu_book" /> {t('settings.documentation')}</h3>
                  <Tooltip content={t('settings.tooltips.documentation')} position="right" maxWidth={350}>
                    <span className="info-icon" aria-label={t('common.moreInfo')}>i</span>
                  </Tooltip>
                </div>
                <p className="setting-help">{t('settings.documentationHelp')}</p>
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
                    <MaterialIcon name="open_in_new" /> {t('settings.contributingGuide')}
                  </a>
                  <a 
                    href="https://github.com/mbianchidev/fire-tools/blob/main/SUPPORT.md" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="secondary-btn external-link-btn"
                  >
                    <MaterialIcon name="open_in_new" /> {t('settings.support')}
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* About */}
        <section className="settings-section collapsible-section">
          <button
            className="collapsible-header"
            onClick={() => toggleSection('about')}
            aria-expanded={!collapsedSections.has('about')}
            aria-controls="about-content"
          >
            <h2><MaterialIcon name="info" /> {t('settings.sections.about')} <span className="collapse-icon-small" aria-hidden="true">{collapsedSections.has('about') ? '▶' : '▼'}</span></h2>
          </button>
          {!collapsedSections.has('about') && (
            <div id="about-content" className="collapsible-content">
              <AboutSection />
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
