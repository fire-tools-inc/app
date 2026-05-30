import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  NetWorthTrackerData,
  MonthlySnapshot,
  AssetHolding,
  CashEntry,
  PensionEntry,
  FinancialOperation,
  createEmptyMonthlySnapshot,
  createEmptyNetWorthYearData,
  generateNetWorthId,
  ASSET_CLASSES,
  ACCOUNT_TYPES,
  PENSION_TYPES,
  OPERATION_TYPES,
  OperationType,
} from '../types/netWorthTracker';
import { SupportedCurrency, SUPPORTED_CURRENCIES } from '../types/currency';
import { BankInfo, getBanksByCountry, getBankByCode } from '../types/bank';
import {
  calculateMonthlyNetWorth,
  calculateMonthlyVariations,
  calculateNetWorthForecast,
  calculateYTDSummary,
} from '../utils/netWorthCalculator';
import {
  saveNetWorthTrackerData,
  loadNetWorthTrackerData,
  loadAssetAllocation,
  saveAssetAllocation,
} from '../utils/cookieStorage';
import { loadSettings, saveSettings, type DateFormat } from '../utils/cookieSettings';
import { formatDate } from '../utils/dateFormatter';
import { generateDemoNetWorthDataForYear } from '../utils/defaults';
import { syncAssetAllocationToNetWorth, syncNetWorthToAssetAllocation, DEFAULT_ASSET_CLASS_TARGETS } from '../utils/dataSync';
import { fetchMultipleClosingPricesForMonth } from '../utils/priceApi';
import { fetchAssetPrices } from '../utils/dcaCalculator';
import { formatDisplayCurrency, formatDisplayPercent, formatDisplayNumber } from '../utils/numberFormatter';
import { DataManagement } from './DataManagement';
import { HistoricalNetWorthChart, ChartViewMode } from './HistoricalNetWorthChart';
import { SharedAssetDialog } from './SharedAssetDialog';
import { MaterialIcon } from './MaterialIcon';
import { SearchableSelect } from './SearchableSelect';
import { ScrollToTopButton } from './ScrollToTopButton';
import { PrivacyBlur } from './PrivacyBlur';
import './NetWorthTrackerPage.css';

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Helper to format currency (using centralized formatter)
function formatCurrency(amount: number, _currency: string): string {
  return formatDisplayCurrency(amount);
}

// Helper to format percentage with sign (for variations)
function formatPercent(value: number): string {
  return formatDisplayPercent(value, true);
}

// Get default data
function getDefaultData(): NetWorthTrackerData {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Load default currency from user settings
  const settings = loadSettings();
  const defaultCurrency = settings.currencySettings.defaultCurrency;

  return {
    years: [
      {
        year: currentYear,
        months: [createEmptyMonthlySnapshot(currentYear, currentMonth)],
        isArchived: false,
      },
    ],
    currentYear,
    currentMonth,
    defaultCurrency,
    settings: {
      showPensionInNetWorth: true,
      includeUnrealizedGains: true,
    },
  };
}

// Deep clone helper for immutable state updates
function deepCloneData(data: NetWorthTrackerData): NetWorthTrackerData {
  return JSON.parse(JSON.stringify(data));
}

export function NetWorthTrackerPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [data, setData] = useState<NetWorthTrackerData>(() => {
    const saved = loadNetWorthTrackerData();
    // Always get current default currency from settings
    const settings = loadSettings();
    const currentDefaultCurrency = settings.currencySettings.defaultCurrency;
    
    if (saved) {
      // Update the default currency to match current settings
      return {
        ...saved,
        defaultCurrency: currentDefaultCurrency,
      };
    }
    return getDefaultData();
  });
  
  // Get year/month from URL params or use current
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const urlYear = searchParams.get('year');
  const urlMonth = searchParams.get('month');
  
  const [selectedYear, setSelectedYear] = useState(() => {
    if (urlYear) {
      const year = parseInt(urlYear, 10);
      if (!isNaN(year) && year >= 1900 && year <= 2100) return year;
    }
    return currentYear;
  });
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (urlMonth) {
      const month = parseInt(urlMonth, 10);
      if (!isNaN(month) && month >= 1 && month <= 12) return month;
    }
    return currentMonth;
  });
  
  // Dialog state
  const [showAssetDialog, setShowAssetDialog] = useState(false);
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [showPensionDialog, setShowPensionDialog] = useState(false);
  const [showOperationDialog, setShowOperationDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<AssetHolding | CashEntry | PensionEntry | FinancialOperation | null>(null);
  const [editingItemType, setEditingItemType] = useState<'asset' | 'cash' | 'pension' | 'operation' | null>(null);
  
  // How to use collapsed state
  const [isHowToUseOpen, setIsHowToUseOpen] = useState(false);
  
  // Chart view mode (YTD or All historical data)
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('ytd');
  
  // Privacy mode state (loaded from settings, toggleable on page)
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    const settings = loadSettings();
    return settings.privacyMode;
  });
  
  // Date format state (loaded from settings)
  const [dateFormat, setDateFormat] = useState<DateFormat>(() => {
    const settings = loadSettings();
    return settings.dateFormat;
  });
  
  // Search threshold state (loaded from settings)
  const [searchThreshold] = useState<number>(() => {
    const settings = loadSettings();
    return settings.searchThreshold ?? 8;
  });
  
  // Listen for settings changes (e.g., from Settings page)
  useEffect(() => {
    const handleStorageChange = () => {
      const settings = loadSettings();
      setDateFormat(settings.dateFormat);
      setIsPrivacyMode(settings.privacyMode);
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleStorageChange);
    };
  }, []);
  
  // Toggle privacy mode and save to settings
  const togglePrivacyMode = () => {
    const newMode = !isPrivacyMode;
    setIsPrivacyMode(newMode);
    const settings = loadSettings();
    saveSettings({ ...settings, privacyMode: newMode });
  };
  
  // Track if we're currently syncing to prevent infinite loops
  const isSyncingRef = useRef(false);

  // Sync URL params when year/month changes
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('year', selectedYear.toString());
    newParams.set('month', selectedMonth.toString());
    setSearchParams(newParams, { replace: true });
  }, [selectedYear, selectedMonth, setSearchParams, searchParams]);

  // Save data whenever it changes, and sync if enabled
  useEffect(() => {
    // Prevent sync loop - don't sync if we're already syncing
    if (isSyncingRef.current) {
      return;
    }
    
    saveNetWorthTrackerData(data);
    
    // If sync is enabled and we're viewing the current month, sync to Asset Allocation
    if (data.settings.syncWithAssetAllocation && 
        selectedYear === currentYear && 
        selectedMonth === currentMonth) {
      const yearData = data.years.find(y => y.year === currentYear);
      const monthData = yearData?.months.find(m => m.month === currentMonth);
      
      if (monthData) {
        // Sync Net Worth → Asset Allocation
        isSyncingRef.current = true;
        const syncedAssets = syncNetWorthToAssetAllocation(data);
        const { assetClassTargets } = loadAssetAllocation();
        saveAssetAllocation(syncedAssets, assetClassTargets || DEFAULT_ASSET_CLASS_TARGETS);
        // Reset flag after a brief delay to allow other component to process
        setTimeout(() => {
          isSyncingRef.current = false;
        }, 100);
      }
    }
  }, [data, selectedYear, selectedMonth, currentYear, currentMonth]);

  // Check if we're viewing a past period
  const isViewingPastPeriod = selectedYear < currentYear || 
    (selectedYear === currentYear && selectedMonth < currentMonth);

  // Check if we're viewing the current period
  const isViewingCurrentPeriod = selectedYear === currentYear && selectedMonth === currentMonth;

  // Navigate to current period
  const goToCurrentPeriod = useCallback(() => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
  }, [currentYear, currentMonth]);

  // Get current month data
  const currentMonthData = useMemo(() => {
    const yearData = data.years.find(y => y.year === selectedYear);
    if (!yearData) return null;
    return yearData.months.find(m => m.month === selectedMonth);
  }, [data, selectedYear, selectedMonth]);

  // Calculate net worth for current month
  const netWorthResult = useMemo(() => {
    if (!currentMonthData) {
      return { totalAssetValue: 0, totalCash: 0, totalPension: 0, totalTaxesPaid: 0, netWorth: 0 };
    }
    return calculateMonthlyNetWorth(currentMonthData, {
      includePension: data.settings.showPensionInNetWorth,
    });
  }, [currentMonthData, data.settings.showPensionInNetWorth]);

  // Get all months data for the selected year (YTD mode)
  const allMonthsData = useMemo(() => {
    const yearData = data.years.find(y => y.year === selectedYear);
    return yearData?.months || [];
  }, [data, selectedYear]);

  // Get ALL historical months data (All mode)
  const allHistoricalMonthsData = useMemo(() => {
    const allMonths: typeof allMonthsData = [];
    for (const year of data.years) {
      allMonths.push(...year.months);
    }
    // Sort by year and month
    return allMonths.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [data.years]);

  // Get the appropriate data based on view mode
  const chartMonthsData = useMemo(() => {
    return chartViewMode === 'all' ? allHistoricalMonthsData : allMonthsData;
  }, [chartViewMode, allMonthsData, allHistoricalMonthsData]);

  // Calculate monthly variations based on view mode
  const monthlyVariations = useMemo(() => {
    return calculateMonthlyVariations(chartMonthsData);
  }, [chartMonthsData]);

  // Calculate YTD summary (always from current year data)
  const ytdSummary = useMemo(() => {
    return calculateYTDSummary(allMonthsData, selectedMonth);
  }, [allMonthsData, selectedMonth]);

  // Calculate forecast based on view mode data
  const forecast = useMemo(() => {
    return calculateNetWorthForecast(chartMonthsData, 3);
  }, [chartMonthsData]);

  // Get previous year's December value
  const previousYearEndValue = useMemo(() => {
    const prevYear = data.years.find(y => y.year === selectedYear - 1);
    if (!prevYear) return null;
    const december = prevYear.months.find(m => m.month === 12);
    if (!december) return null;
    return calculateMonthlyNetWorth(december).netWorth;
  }, [data, selectedYear]);

  // Get current month variation
  const currentMonthVariation = useMemo(() => {
    if (monthlyVariations.length === 0) return null;
    return monthlyVariations.find(v => v.month === `${SHORT_MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`);
  }, [monthlyVariations, selectedMonth, selectedYear]);

  // Helper to find previous month's data
  const getPreviousMonthData = useCallback((data: NetWorthTrackerData, year: number, month: number) => {
    // Calculate previous month
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }

    // Try to find data from previous month
    const prevYearData = data.years.find(y => y.year === prevYear);
    if (prevYearData) {
      const prevMonthData = prevYearData.months.find(m => m.month === prevMonth);
      if (prevMonthData) {
        return prevMonthData;
      }
    }

    // If no previous month, find the most recent month with data
    const allMonths: { year: number; month: number; data: MonthlySnapshot }[] = [];
    for (const yr of data.years) {
      for (const mo of yr.months) {
        if (yr.year < year || (yr.year === year && mo.month < month)) {
          allMonths.push({ year: yr.year, month: mo.month, data: mo });
        }
      }
    }
    
    if (allMonths.length === 0) return null;
    
    // Sort by date descending and get the most recent
    allMonths.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    
    return allMonths[0].data;
  }, []);

  // Ensure month exists (for "Log This Month" button), inherit assets from previous period
  // Uses name as unique identifier - won't duplicate assets with the same name
  const handleAddMonth = useCallback(() => {
    setData(prev => {
      const newData = deepCloneData(prev);
      
      // Ensure year exists
      let yearData = newData.years.find(y => y.year === selectedYear);
      if (!yearData) {
        yearData = createEmptyNetWorthYearData(selectedYear);
        newData.years.push(yearData);
        newData.years.sort((a, b) => a.year - b.year);
      }
      
      // Check if month already exists
      let monthData = yearData.months.find(m => m.month === selectedMonth);
      if (!monthData) {
        // Create new month with empty data
        monthData = createEmptyMonthlySnapshot(selectedYear, selectedMonth);
        yearData.months.push(monthData);
        yearData.months.sort((a, b) => a.month - b.month);
      }
      
      // Inherit assets, cash, and pensions from previous period
      // Use name as unique identifier - only add items that don't already exist
      const prevMonthData = getPreviousMonthData(prev, selectedYear, selectedMonth);
      if (prevMonthData) {
        // Get existing names for deduplication
        const existingAssetNames = new Set(monthData.assets.map(a => a.name.toLowerCase()));
        const existingCashNames = new Set(monthData.cashEntries.map(c => c.accountName.toLowerCase()));
        const existingPensionNames = new Set(monthData.pensions.map(p => p.name.toLowerCase()));
        
        // Collect tickers for price fetching
        const tickersToFetch: string[] = [];
        
        // Add assets that don't already exist (by name)
        // Carry forward acquisitionPrice, pricePerShare will be updated by month-end fetch
        for (const asset of prevMonthData.assets) {
          if (!existingAssetNames.has(asset.name.toLowerCase())) {
            monthData.assets.push({
              ...asset,
              id: generateNetWorthId(),
              acquisitionPrice: asset.acquisitionPrice ?? asset.pricePerShare,
            });
            existingAssetNames.add(asset.name.toLowerCase());
            if (asset.ticker && asset.ticker.trim().length > 0) {
              tickersToFetch.push(asset.ticker.trim().toUpperCase());
            }
          }
        }
        
        // Fetch month-end closing prices for inherited ticker-based assets
        if (tickersToFetch.length > 0) {
          const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;
          if (isCurrentMonth) {
            // For current month: fetch latest market prices
            fetchAssetPrices([...new Set(tickersToFetch)]).then(prices => {
              setData(prevData => {
                const updated = deepCloneData(prevData);
                const yr = updated.years.find(y => y.year === selectedYear);
                const mo = yr?.months.find(m => m.month === selectedMonth);
                if (mo) {
                  for (const asset of mo.assets) {
                    const ticker = asset.ticker?.trim().toUpperCase();
                    if (ticker && prices[ticker] != null) {
                      asset.pricePerShare = prices[ticker]!;
                    }
                  }
                }
                return updated;
              });
            });
          } else {
            // For past months: fetch closing price for that month's last trading day
            fetchMultipleClosingPricesForMonth([...new Set(tickersToFetch)], selectedYear, selectedMonth).then(prices => {
              setData(prevData => {
                const updated = deepCloneData(prevData);
                const yr = updated.years.find(y => y.year === selectedYear);
                const mo = yr?.months.find(m => m.month === selectedMonth);
                if (mo) {
                  for (const asset of mo.assets) {
                    const ticker = asset.ticker?.trim().toUpperCase();
                    if (ticker && prices[ticker]) {
                      asset.pricePerShare = prices[ticker]!.price;
                    }
                  }
                }
                return updated;
              });
            });
          }
        }
        
        // Add cash entries that don't already exist (by account name)
        for (const cash of prevMonthData.cashEntries) {
          if (!existingCashNames.has(cash.accountName.toLowerCase())) {
            monthData.cashEntries.push({
              ...cash,
              id: generateNetWorthId(),
            });
            existingCashNames.add(cash.accountName.toLowerCase());
          }
        }
        
        // Add pensions that don't already exist (by name)
        for (const pension of prevMonthData.pensions) {
          if (!existingPensionNames.has(pension.name.toLowerCase())) {
            monthData.pensions.push({
              ...pension,
              id: generateNetWorthId(),
            });
            existingPensionNames.add(pension.name.toLowerCase());
          }
        }
        // Note: operations are NOT inherited - they are specific to each month
      }
      
      return newData;
    });
  }, [selectedYear, selectedMonth, getPreviousMonthData]);

  // Check if asset name already exists (for validation)
  const isAssetNameDuplicate = useCallback((name: string, excludeId?: string): boolean => {
    if (!currentMonthData) return false;
    const normalizedName = name.toLowerCase().trim();
    return currentMonthData.assets.some(
      a => a.name.toLowerCase().trim() === normalizedName && a.id !== excludeId
    );
  }, [currentMonthData]);

  // Check if cash account name already exists (for validation)
  const isCashNameDuplicate = useCallback((accountName: string, excludeId?: string): boolean => {
    if (!currentMonthData) return false;
    const normalizedName = accountName.toLowerCase().trim();
    return currentMonthData.cashEntries.some(
      c => c.accountName.toLowerCase().trim() === normalizedName && c.id !== excludeId
    );
  }, [currentMonthData]);

  // Check if pension name already exists (for validation)
  const isPensionNameDuplicate = useCallback((name: string, excludeId?: string): boolean => {
    if (!currentMonthData) return false;
    const normalizedName = name.toLowerCase().trim();
    return currentMonthData.pensions.some(
      p => p.name.toLowerCase().trim() === normalizedName && p.id !== excludeId
    );
  }, [currentMonthData]);

  // Add asset
  const handleAddAsset = useCallback((asset: Omit<AssetHolding, 'id'>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      
      // Ensure year and month exist
      let yearData = newData.years.find(y => y.year === selectedYear);
      if (!yearData) {
        yearData = createEmptyNetWorthYearData(selectedYear);
        newData.years.push(yearData);
      }
      
      let monthData = yearData.months.find(m => m.month === selectedMonth);
      if (!monthData) {
        monthData = createEmptyMonthlySnapshot(selectedYear, selectedMonth);
        yearData.months.push(monthData);
      }
      
      const newAsset: AssetHolding = {
        ...asset,
        id: generateNetWorthId(),
      };
      monthData.assets.push(newAsset);
      
      return newData;
    });
    setShowAssetDialog(false);
  }, [selectedYear, selectedMonth]);

  // Add cash entry
  const handleAddCash = useCallback((cash: Omit<CashEntry, 'id'>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      
      let yearData = newData.years.find(y => y.year === selectedYear);
      if (!yearData) {
        yearData = createEmptyNetWorthYearData(selectedYear);
        newData.years.push(yearData);
      }
      
      let monthData = yearData.months.find(m => m.month === selectedMonth);
      if (!monthData) {
        monthData = createEmptyMonthlySnapshot(selectedYear, selectedMonth);
        yearData.months.push(monthData);
      }
      
      const newCash: CashEntry = {
        ...cash,
        id: generateNetWorthId(),
      };
      monthData.cashEntries.push(newCash);
      
      return newData;
    });
    setShowCashDialog(false);
  }, [selectedYear, selectedMonth]);

  // Add pension entry
  const handleAddPension = useCallback((pension: Omit<PensionEntry, 'id'>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      
      let yearData = newData.years.find(y => y.year === selectedYear);
      if (!yearData) {
        yearData = createEmptyNetWorthYearData(selectedYear);
        newData.years.push(yearData);
      }
      
      let monthData = yearData.months.find(m => m.month === selectedMonth);
      if (!monthData) {
        monthData = createEmptyMonthlySnapshot(selectedYear, selectedMonth);
        yearData.months.push(monthData);
      }
      
      const newPension: PensionEntry = {
        ...pension,
        id: generateNetWorthId(),
      };
      monthData.pensions.push(newPension);
      
      return newData;
    });
    setShowPensionDialog(false);
  }, [selectedYear, selectedMonth]);

  // Add operation
  const handleAddOperation = useCallback((operation: Omit<FinancialOperation, 'id'>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      
      let yearData = newData.years.find(y => y.year === selectedYear);
      if (!yearData) {
        yearData = createEmptyNetWorthYearData(selectedYear);
        newData.years.push(yearData);
      }
      
      let monthData = yearData.months.find(m => m.month === selectedMonth);
      if (!monthData) {
        monthData = createEmptyMonthlySnapshot(selectedYear, selectedMonth);
        yearData.months.push(monthData);
      }
      
      const newOperation: FinancialOperation = {
        ...operation,
        id: generateNetWorthId(),
      };
      monthData.operations.push(newOperation);
      
      return newData;
    });
    setShowOperationDialog(false);
  }, [selectedYear, selectedMonth]);

  // Update item handlers
  const handleUpdateAsset = useCallback((id: string, updates: Partial<AssetHolding>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.assets.findIndex(a => a.id === id);
          if (index !== -1) {
            monthData.assets[index] = { ...monthData.assets[index], ...updates };
            return newData;
          }
        }
      }
      return newData;
    });
    setEditingItem(null);
    setEditingItemType(null);
  }, []);

  const handleUpdateCash = useCallback((id: string, updates: Partial<CashEntry>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.cashEntries.findIndex(c => c.id === id);
          if (index !== -1) {
            monthData.cashEntries[index] = { ...monthData.cashEntries[index], ...updates };
            return newData;
          }
        }
      }
      return newData;
    });
    setEditingItem(null);
    setEditingItemType(null);
  }, []);

  const handleUpdatePension = useCallback((id: string, updates: Partial<PensionEntry>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.pensions.findIndex(p => p.id === id);
          if (index !== -1) {
            monthData.pensions[index] = { ...monthData.pensions[index], ...updates };
            return newData;
          }
        }
      }
      return newData;
    });
    setEditingItem(null);
    setEditingItemType(null);
  }, []);

  // Delete item handlers
  const handleDeleteAsset = useCallback((id: string) => {
    if (!confirm(t('netWorth.confirm.deleteAsset'))) return;
    
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.assets.findIndex(a => a.id === id);
          if (index !== -1) {
            monthData.assets.splice(index, 1);
            return newData;
          }
        }
      }
      return newData;
    });
  }, []);

  const handleDeleteCash = useCallback((id: string) => {
    if (!confirm(t('netWorth.confirm.deleteCash'))) return;
    
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.cashEntries.findIndex(c => c.id === id);
          if (index !== -1) {
            monthData.cashEntries.splice(index, 1);
            return newData;
          }
        }
      }
      return newData;
    });
  }, []);

  const handleDeletePension = useCallback((id: string) => {
    if (!confirm(t('netWorth.confirm.deletePension'))) return;
    
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.pensions.findIndex(p => p.id === id);
          if (index !== -1) {
            monthData.pensions.splice(index, 1);
            return newData;
          }
        }
      }
      return newData;
    });
  }, []);

  const handleDeleteOperation = useCallback((id: string) => {
    if (!confirm(t('netWorth.confirm.deleteOperation'))) return;
    
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.operations.findIndex(o => o.id === id);
          if (index !== -1) {
            monthData.operations.splice(index, 1);
            return newData;
          }
        }
      }
      return newData;
    });
  }, []);

  // Export data (simple JSON export for now)
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `net-worth-tracker-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import data
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const imported = JSON.parse(json) as NetWorthTrackerData;
        setData(imported);
        if (imported.currentYear) setSelectedYear(imported.currentYear);
        if (imported.currentMonth) setSelectedMonth(imported.currentMonth);
      } catch (error) {
        alert(t('netWorth.messages.importDataError', { message: error instanceof Error ? error.message : t('common.unknownError') }));
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Reset data
  const handleResetData = () => {
    if (confirm(t('netWorth.confirm.reset'))) {
      const defaultData = getDefaultData();
      setData(defaultData);
      setSelectedYear(defaultData.currentYear);
      setSelectedMonth(defaultData.currentMonth);
    }
  };

  // Toggle sync with Asset Allocation
  const handleToggleSync = useCallback((enabled: boolean) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      newData.settings.syncWithAssetAllocation = enabled;
      
      // If enabling sync and viewing current month, import from Asset Allocation
      if (enabled && selectedYear === currentYear && selectedMonth === currentMonth) {
        const { assets } = loadAssetAllocation();
        if (assets && assets.length > 0) {
          const synced = syncAssetAllocationToNetWorth(assets, newData);
          return synced;
        }
      }
      
      return newData;
    });
  }, [selectedYear, selectedMonth, currentYear, currentMonth]);

  // Load demo data for the currently selected year
  const handleLoadDemo = useCallback(() => {
    if (confirm(t('netWorth.confirm.loadDemo', { year: selectedYear }))) {
      setData(prev => {
        const newData = deepCloneData(prev);
        
        // Generate demo data for the selected year
        const demoMonths = generateDemoNetWorthDataForYear(selectedYear);
        
        // Find or create the year entry
        const existingYearIndex = newData.years.findIndex(y => y.year === selectedYear);
        
        if (existingYearIndex !== -1) {
          // Replace existing year's months with demo data
          newData.years[existingYearIndex].months = demoMonths;
        } else {
          // Add new year with demo data
          newData.years.push({
            year: selectedYear,
            months: demoMonths,
            isArchived: false,
          });
          // Sort years chronologically
          newData.years.sort((a, b) => a.year - b.year);
        }
        
        return newData;
      });
      // Navigate to January of the selected year to show the demo data
      setSelectedMonth(1);
    }
  }, [selectedYear]);

  // Available years for selector
  const availableYears = useMemo(() => {
    const years = new Set(data.years.map(y => y.year));
    years.add(currentYear);
    for (let i = 1; i <= 5; i++) {
      years.add(currentYear - i);
    }
    years.add(currentYear + 1);
    return Array.from(years).sort((a, b) => b - a);
  }, [data, currentYear]);

  // Available months
  const availableMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  const getMonthName = (month: number) => t(`common.months.${MONTH_NAMES[month - 1].toLowerCase()}`);

  return (
    <div className="net-worth-tracker-page">
      <header className="page-header">
        <div className="page-header-top">
          <h1><MaterialIcon name="trending_up" className="page-header-icon" /> {t('netWorth.title')}</h1>
        </div>
        <p>
          {t('netWorth.subtitle')}
        </p>
      </header>

      <main className="net-worth-tracker-main" id="main-content">
        {/* How to Use Section */}
        <section className="allocation-info collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => setIsHowToUseOpen(!isHowToUseOpen)}
            aria-expanded={isHowToUseOpen}
            aria-controls="how-to-use-content"
          >
            <h4><MaterialIcon name="lightbulb" /> {t('netWorth.howItWorks.title')} <span className="collapse-icon-small" aria-hidden="true">{isHowToUseOpen ? '▼' : '▶'}</span></h4>
          </button>
          {isHowToUseOpen && (
            <ul id="how-to-use-content" className="how-to-use-content">
              <li><strong>{t('netWorth.howItWorks.logAssetsLabel')}</strong> {t('netWorth.howItWorks.logAssetsText')}</li>
              <li><strong>{t('netWorth.howItWorks.logCashLabel')}</strong> {t('netWorth.howItWorks.logCashText')}</li>
              <li><strong>{t('netWorth.howItWorks.logPensionsLabel')}</strong> {t('netWorth.howItWorks.logPensionsText')}</li>
              <li><strong>{t('netWorth.howItWorks.logOperationsLabel')}</strong> {t('netWorth.howItWorks.logOperationsText')}</li>
              <li><strong>{t('netWorth.howItWorks.monthlySnapshotLabel')}</strong> {t('netWorth.howItWorks.monthlySnapshotText')}</li>
              <li><strong>{t('netWorth.howItWorks.viewHistoryLabel')}</strong> {t('netWorth.howItWorks.viewHistoryText')}</li>
              <li><strong>{t('netWorth.howItWorks.forecastConfidenceLabel')}</strong> {t('netWorth.howItWorks.forecastConfidenceText')}</li>
              <li><strong>{t('netWorth.howItWorks.assetAllocationSyncLabel')}</strong> {t('netWorth.howItWorks.assetAllocationSyncText')}</li>
            </ul>
          )}
        </section>

        {/* Sync Configuration */}
        {isViewingCurrentPeriod && (
          <section className="sync-config-section" aria-labelledby="sync-config-heading" data-tour="sync-options">
            <h3 id="sync-config-heading" className="visually-hidden">{t('netWorth.assetAllocationSync')}</h3>
            <div className="sync-config-content">
              <label className="sync-toggle-label">
                <input
                  type="checkbox"
                  checked={data.settings.syncWithAssetAllocation || false}
                  onChange={(e) => handleToggleSync(e.target.checked)}
                  aria-label={t('netWorth.syncWithAssetAllocationAria')}
                />
                <span className="toggle-switch"></span>
                <span className="sync-label-text">
                  <MaterialIcon name="sync" /> {t('netWorth.syncCurrentMonth')}
                </span>
              </label>
              {data.settings.syncWithAssetAllocation && (
                <p className="sync-info">
                  <span aria-hidden="true">ℹ️</span> {t('netWorth.syncInfo')}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Data Management */}
        <DataManagement
          onExport={handleExport}
          onImport={handleImport}
          onReset={handleResetData}
          onLoadDemo={handleLoadDemo}
          defaultOpen={false}
          fileFormat="json"
        />

        {/* Month/Year Selector */}
        <section className="period-selector" aria-labelledby="period-selector-heading">
          <h3 id="period-selector-heading" className="visually-hidden">{t('netWorth.selectPeriod')}</h3>
          <div className="selector-row">
            <div className="selector-group">
              <label htmlFor="year-select">{t('netWorth.year')}</label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value));
                  setSelectedMonth(1); // Reset to January when changing year
                }}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="selector-group">
              <label htmlFor="month-select">{t('netWorth.month')}</label>
              <select
                id="month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {availableMonths.map(month => (
                  <option key={month} value={month}>{getMonthName(month)}</option>
                ))}
              </select>
            </div>
            <button
              className="btn-add-month"
              onClick={handleAddMonth}
            >
              <MaterialIcon name="add" /> {t('netWorth.startMonthLog')}
            </button>
            {isViewingPastPeriod && (
              <button
                className="btn-current-period"
                onClick={goToCurrentPeriod}
              >
                <MaterialIcon name="event" /> {t('netWorth.backToCurrentPeriod')}
              </button>
            )}
          </div>
        </section>

        {/* Net Worth Summary Cards */}
        <section className="net-worth-summary" aria-labelledby="summary-heading">
          <h3 id="summary-heading">{t('netWorth.summaryFor', { month: getMonthName(selectedMonth), year: selectedYear })}</h3>
          <div className="net-worth-cards">
            <div className="net-worth-card assets">
              <span className="card-icon" aria-hidden="true"><MaterialIcon name="bar_chart" /></span>
              <div className="card-content">
                <span className="card-label">{t('netWorth.totalAssets')}</span>
                <span className="card-value">
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(netWorthResult.totalAssetValue, data.defaultCurrency)}</PrivacyBlur>
                  <button 
                    className="privacy-eye-btn"
                    onClick={togglePrivacyMode}
                    title={isPrivacyMode ? t('common.showValues') : t('common.hideValues')}
                    aria-pressed={isPrivacyMode}
                  >
                    <MaterialIcon name={isPrivacyMode ? 'visibility_off' : 'visibility'} size="small" />
                  </button>
                </span>
                {currentMonthVariation && currentMonthVariation.assetValueChange !== 0 && (
                  <span className={`card-change ${currentMonthVariation.assetValueChange >= 0 ? 'positive' : 'negative'}`}>
                    <PrivacyBlur isPrivacyMode={isPrivacyMode}>{currentMonthVariation.assetValueChange >= 0 ? '+' : ''}{formatCurrency(currentMonthVariation.assetValueChange, data.defaultCurrency)}</PrivacyBlur>
                  </span>
                )}
              </div>
            </div>
            <div className="net-worth-card cash">
              <span className="card-icon" aria-hidden="true"><MaterialIcon name="payments" /></span>
              <div className="card-content">
                <span className="card-label">{t('netWorth.totalCash')}</span>
                <span className="card-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(netWorthResult.totalCash, data.defaultCurrency)}</PrivacyBlur></span>
                {currentMonthVariation && currentMonthVariation.cashChange !== 0 && (
                  <span className={`card-change ${currentMonthVariation.cashChange >= 0 ? 'positive' : 'negative'}`}>
                    <PrivacyBlur isPrivacyMode={isPrivacyMode}>{currentMonthVariation.cashChange >= 0 ? '+' : ''}{formatCurrency(currentMonthVariation.cashChange, data.defaultCurrency)}</PrivacyBlur>
                  </span>
                )}
              </div>
            </div>
            <div className="net-worth-card pension">
              <span className="card-icon" aria-hidden="true"><MaterialIcon name="elderly" /></span>
              <div className="card-content">
                <span className="card-label">{t('netWorth.totalPension')}</span>
                <span className="card-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(netWorthResult.totalPension, data.defaultCurrency)}</PrivacyBlur></span>
                {currentMonthVariation && currentMonthVariation.pensionChange !== 0 && (
                  <span className={`card-change ${currentMonthVariation.pensionChange >= 0 ? 'positive' : 'negative'}`}>
                    <PrivacyBlur isPrivacyMode={isPrivacyMode}>{currentMonthVariation.pensionChange >= 0 ? '+' : ''}{formatCurrency(currentMonthVariation.pensionChange, data.defaultCurrency)}</PrivacyBlur>
                  </span>
                )}
              </div>
            </div>
            <div className="net-worth-card total">
              <span className="card-icon" aria-hidden="true"><MaterialIcon name="account_balance_wallet" /></span>
              <div className="card-content">
                <span className="card-label">{t('netWorth.netWorth')}</span>
                <span className="card-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(netWorthResult.netWorth, data.defaultCurrency)}</PrivacyBlur></span>
                {currentMonthVariation && currentMonthVariation.changeFromPrevMonth !== 0 && (
                  <span className={`card-change ${currentMonthVariation.changeFromPrevMonth >= 0 ? 'positive' : 'negative'}`}>
                    <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatPercent(currentMonthVariation.changePercent)} ({currentMonthVariation.changeFromPrevMonth >= 0 ? '+' : ''}{formatCurrency(currentMonthVariation.changeFromPrevMonth, data.defaultCurrency)})</PrivacyBlur>
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Data Entry Section */}
        <section className="data-entry-section" data-tour="assets-section">
          <div className="section-header">
            <h3>{t('netWorth.monthlyDataEntry')}</h3>
            <div className="entry-actions">
              <button className="btn-entry asset" onClick={() => setShowAssetDialog(true)}>
                <MaterialIcon name="bar_chart" /> {t('netWorth.logAsset')}
              </button>
              <button className="btn-entry cash" onClick={() => setShowCashDialog(true)}>
                <MaterialIcon name="payments" /> {t('netWorth.logCash')}
              </button>
              <button className="btn-entry pension" onClick={() => setShowPensionDialog(true)}>
                <MaterialIcon name="elderly" /> {t('netWorth.logPension')}
              </button>
              <button className="btn-entry operation" onClick={() => setShowOperationDialog(true)}>
                <MaterialIcon name="edit_note" /> {t('netWorth.logOperation')}
              </button>
            </div>
          </div>

          {/* Data Tables */}
          <div className="data-tables">
            {/* Assets Table */}
            <div className="data-table-section">
              <h4><MaterialIcon name="bar_chart" /> {t('netWorth.assets')}</h4>
              {currentMonthData && currentMonthData.assets.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('netWorth.name')}</th>
                      <th>{t('netWorth.ticker')}</th>
                      <th>{t('netWorth.class')}</th>
                      <th>{t('netWorth.shares')}</th>
                      <th className="amount-col">{t('netWorth.marketPrice')}</th>
                      <th className="amount-col">{t('netWorth.acquisitionPrice')}</th>
                      <th className="amount-col">{t('netWorth.value')}</th>
                      <th className="actions-col">{t('netWorth.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMonthData.assets.map(asset => {
                      // Hide shares/price for value-only assets (property, vehicles, collectibles, art, physical gold)
                      const VALUE_ONLY_SYNC_TYPES = ['PROPERTY', 'CAR', 'MOTORCYCLE', 'BOAT', 'OTHER_VEHICLE', 'WATCH', 'WINE', 'JEWELRY', 'SPORTS_MEMORABILIA', 'OTHER_COLLECTIBLE', 'PAINTING', 'SCULPTURE', 'DIGITAL_ART', 'OTHER_ART', 'PHYSICAL_GOLD'];
                      const isValueOnlyAsset = VALUE_ONLY_SYNC_TYPES.includes(asset.syncSubAssetType || '') || ['VEHICLE', 'COLLECTIBLE', 'ART'].includes(asset.assetClass);
                      return (
                        <tr key={asset.id}>
                          <td>{asset.name}</td>
                          <td>{asset.ticker}</td>
                          <td>{ASSET_CLASSES.find(c => c.id === asset.assetClass)?.name || asset.assetClass}</td>
                          <td>{isValueOnlyAsset ? '-' : <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayNumber(asset.shares)}</PrivacyBlur>}</td>
                          <td className="amount-col">{isValueOnlyAsset ? '-' : <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(asset.pricePerShare, asset.currency)}</PrivacyBlur>}</td>
                          <td className="amount-col">{isValueOnlyAsset || !asset.acquisitionPrice ? '-' : <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(asset.acquisitionPrice, asset.currency)}</PrivacyBlur>}</td>
                          <td className="amount-col"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(asset.shares * asset.pricePerShare, asset.currency)}</PrivacyBlur></td>
                          <td className="actions-col">
                            <button
                              className="btn-icon"
                              onClick={() => { setEditingItem(asset); setEditingItemType('asset'); setShowAssetDialog(true); }}
                              aria-label={t('netWorth.editAsset')}
                            >
                              <MaterialIcon name="edit" size="small" />
                            </button>
                            <button
                              className="btn-icon delete"
                              onClick={() => handleDeleteAsset(asset.id)}
                              aria-label={t('netWorth.deleteAsset')}
                            >
                              <MaterialIcon name="delete" size="small" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <p>{t('netWorth.emptyAssets')}</p>
                </div>
              )}
            </div>

            {/* Cash Table */}
            <div className="data-table-section">
              <h4><MaterialIcon name="payments" /> {t('netWorth.cashAndLiquidity')}</h4>
              {currentMonthData && currentMonthData.cashEntries.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('netWorth.account')}</th>
                      <th>{t('netWorth.type')}</th>
                      <th className="amount-col">{t('netWorth.balance')}</th>
                      <th className="actions-col">{t('netWorth.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMonthData.cashEntries.map(cash => (
                      <tr key={cash.id}>
                        <td>
                          {cash.accountName}
                          {cash.institutionName && (
                            <span className="institution-tag" title={cash.institutionName}>
                              <MaterialIcon name="account_balance" size="small" /> {cash.institutionName}
                            </span>
                          )}
                        </td>
                        <td>{ACCOUNT_TYPES.find(t => t.id === cash.accountType)?.name || cash.accountType}</td>
                        <td className="amount-col"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(cash.balance, cash.currency)}</PrivacyBlur></td>
                        <td className="actions-col">
                          <button
                            className="btn-icon"
                            onClick={() => { setEditingItem(cash); setEditingItemType('cash'); setShowCashDialog(true); }}
                            aria-label={t('netWorth.editCashEntry')}
                          >
                            <MaterialIcon name="edit" size="small" />
                          </button>
                          <button
                            className="btn-icon delete"
                            onClick={() => handleDeleteCash(cash.id)}
                            aria-label={t('netWorth.deleteCashEntry')}
                          >
                            <MaterialIcon name="delete" size="small" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <p>{t('netWorth.emptyCash')}</p>
                </div>
              )}
            </div>

            {/* Pensions Table */}
            <div className="data-table-section">
              <h4><MaterialIcon name="elderly" /> {t('netWorth.pensions')}</h4>
              {currentMonthData && currentMonthData.pensions.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('netWorth.name')}</th>
                      <th>{t('netWorth.type')}</th>
                      <th className="amount-col">{t('netWorth.value')}</th>
                      <th className="actions-col">{t('netWorth.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMonthData.pensions.map(pension => (
                      <tr key={pension.id}>
                        <td>{pension.name}</td>
                        <td>{PENSION_TYPES.find(t => t.id === pension.pensionType)?.name || pension.pensionType}</td>
                        <td className="amount-col">{formatCurrency(pension.currentValue, pension.currency)}</td>
                        <td className="actions-col">
                          <button
                            className="btn-icon"
                            onClick={() => { setEditingItem(pension); setEditingItemType('pension'); setShowPensionDialog(true); }}
                            aria-label={t('netWorth.editPension')}
                          >
                            <MaterialIcon name="edit" size="small" />
                          </button>
                          <button
                            className="btn-icon delete"
                            onClick={() => handleDeletePension(pension.id)}
                            aria-label={t('netWorth.deletePension')}
                          >
                            <MaterialIcon name="delete" size="small" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <p>{t('netWorth.emptyPensions')}</p>
                </div>
              )}
            </div>

            {/* Operations Table */}
            <div className="data-table-section">
              <h4><MaterialIcon name="edit_note" /> {t('netWorth.financialOperations')}</h4>
              {currentMonthData && currentMonthData.operations.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('netWorth.date')}</th>
                      <th>{t('netWorth.type')}</th>
                      <th>{t('netWorth.description')}</th>
                      <th className="amount-col">{t('netWorth.amount')}</th>
                      <th className="actions-col">{t('netWorth.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMonthData.operations.map(op => {
                      const opType = OPERATION_TYPES.find(t => t.id === op.type);
                      return (
                        <tr key={op.id}>
                          <td>{formatDate(op.date, dateFormat)}</td>
                          <td><MaterialIcon name={opType?.icon || 'edit_note'} size="small" /> {opType?.name || op.type}</td>
                          <td>{op.description}</td>
                          <td className={`amount-col ${opType?.isIncome ? 'positive' : 'negative'}`}>
                            {opType?.isIncome ? '+' : '-'}{formatCurrency(op.amount, op.currency)}
                          </td>
                          <td className="actions-col">
                            <button
                              className="btn-icon delete"
                              onClick={() => handleDeleteOperation(op.id)}
                              aria-label={t('netWorth.deleteOperation')}
                            >
                              <MaterialIcon name="delete" size="small" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <p>{t('netWorth.emptyOperations')}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Historical Net Worth Chart */}
        <section className="chart-section" data-tour="historical-chart">
          <h3><MaterialIcon name="trending_up" /> {t('netWorth.historicalNetWorth')}</h3>
          <HistoricalNetWorthChart
            variations={monthlyVariations}
            forecast={forecast}
            currency={data.defaultCurrency}
            previousYearEnd={previousYearEndValue}
            viewMode={chartViewMode}
            onViewModeChange={setChartViewMode}
            isPrivacyMode={isPrivacyMode}
          />
        </section>

        {/* YTD Summary - only show in YTD mode */}
        {chartViewMode === 'ytd' && ytdSummary.averageMonthlyNetWorth > 0 && (
          <section className="fire-progress-section">
            <h3><MaterialIcon name="gps_fixed" /> {t('netWorth.yearToDateProgress')}</h3>
            <div className="fire-progress-content">
              <div className="fire-percentage">
                <div className="percentage">{formatPercent(ytdSummary.netWorthChangePercent)}</div>
                <div className="label">{t('netWorth.ytdChange')}</div>
              </div>
              <div className="fire-details">
                <div className="fire-detail-item">
                  <div className="value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(ytdSummary.netWorthChange, data.defaultCurrency)}</PrivacyBlur></div>
                  <div className="label">{t('netWorth.netWorthChange')}</div>
                </div>
                <div className="fire-detail-item">
                  <div className="value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(ytdSummary.averageMonthlyNetWorth, data.defaultCurrency)}</PrivacyBlur></div>
                  <div className="label">{t('netWorth.avgMonthlyNetWorth')}</div>
                </div>
                <div className="fire-detail-item">
                  <div className="value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{previousYearEndValue ? formatCurrency(previousYearEndValue, data.defaultCurrency) : 'N/A'}</PrivacyBlur></div>
                  <div className="label">{t('common.shortMonths.december')} {selectedYear - 1}</div>
                </div>
              </div>
            </div>
            {ytdSummary.netWorthChangePercent !== 0 && (
              <div className="fire-progress-bar">
                <div 
                  className="fire-progress-fill" 
                  style={{ width: `${Math.min(Math.abs(ytdSummary.netWorthChangePercent), 100)}%` }}
                />
              </div>
            )}
          </section>
        )}

        {/* Asset Dialog */}
        {showAssetDialog && (
          <SharedAssetDialog
            mode="netWorthTracker"
            isOpen={showAssetDialog}
            initialData={editingItemType === 'asset' ? editingItem as AssetHolding : undefined}
            onSubmit={editingItemType === 'asset' && editingItem 
              ? (data) => handleUpdateAsset((editingItem as AssetHolding).id, data)
              : handleAddAsset
            }
            onClose={() => { setShowAssetDialog(false); setEditingItem(null); setEditingItemType(null); }}
            defaultCurrency={data.defaultCurrency}
            isNameDuplicate={(name) => isAssetNameDuplicate(name, editingItemType === 'asset' ? (editingItem as AssetHolding)?.id : undefined)}
          />
        )}

        {/* Cash Dialog */}
        {showCashDialog && (
          <CashDialog
            initialData={editingItemType === 'cash' ? editingItem as CashEntry : undefined}
            onSubmit={editingItemType === 'cash' && editingItem 
              ? (data) => handleUpdateCash((editingItem as CashEntry).id, data)
              : handleAddCash
            }
            onClose={() => { setShowCashDialog(false); setEditingItem(null); setEditingItemType(null); }}
            defaultCurrency={data.defaultCurrency}
            isNameDuplicate={(name) => isCashNameDuplicate(name, editingItemType === 'cash' ? (editingItem as CashEntry)?.id : undefined)}
            searchThreshold={searchThreshold}
          />
        )}

        {/* Pension Dialog */}
        {showPensionDialog && (
          <PensionDialog
            initialData={editingItemType === 'pension' ? editingItem as PensionEntry : undefined}
            onSubmit={editingItemType === 'pension' && editingItem 
              ? (data) => handleUpdatePension((editingItem as PensionEntry).id, data)
              : handleAddPension
            }
            onClose={() => { setShowPensionDialog(false); setEditingItem(null); setEditingItemType(null); }}
            defaultCurrency={data.defaultCurrency}
            isNameDuplicate={(name) => isPensionNameDuplicate(name, editingItemType === 'pension' ? (editingItem as PensionEntry)?.id : undefined)}
            searchThreshold={searchThreshold}
          />
        )}

        {/* Operation Dialog */}
        {showOperationDialog && (
          <OperationDialog
            onSubmit={handleAddOperation}
            onClose={() => setShowOperationDialog(false)}
            defaultCurrency={data.defaultCurrency}
            defaultDate={`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`}
            searchThreshold={searchThreshold}
          />
        )}

        <ScrollToTopButton />
      </main>
    </div>
  );
}


// Cash Dialog Component (with bank provider selection - same as Asset Allocation)
interface CashDialogProps {
  initialData?: CashEntry;
  onSubmit: (data: Omit<CashEntry, 'id'>) => void;
  onClose: () => void;
  defaultCurrency: SupportedCurrency;
  isNameDuplicate?: (name: string) => boolean;
  searchThreshold?: number;
}

function CashDialog({ initialData, onSubmit, onClose, defaultCurrency, isNameDuplicate, searchThreshold }: CashDialogProps) {
  const { t } = useTranslation();
  const [accountName, setAccountName] = useState(initialData?.accountName || '');
  const [accountType, setAccountType] = useState<CashEntry['accountType']>(initialData?.accountType || 'SAVINGS');
  const [balance, setBalance] = useState(initialData?.balance?.toString() || '');
  const [currency, setCurrency] = useState<SupportedCurrency>(initialData?.currency || defaultCurrency);
  const [note, setNote] = useState(initialData?.note || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [institutionCode, setInstitutionCode] = useState<string>(initialData?.institutionCode || '');
  const [institutionName, setInstitutionName] = useState<string>(initialData?.institutionName || '');

  // Get user settings for country
  const settings = loadSettings();
  
  // Get banks for the user's country
  const countryBanks: BankInfo[] = settings.country ? getBanksByCountry(settings.country) : [];

  const handleNameChange = (newName: string) => {
    setAccountName(newName);
    if (isNameDuplicate && isNameDuplicate(newName)) {
      setNameError(t('netWorth.validation.accountExists'));
    } else {
      setNameError(null);
    }
  };

  const handleInstitutionChange = (code: string) => {
    setInstitutionCode(code);
    if (code && code !== 'OTHER') {
      const bank = getBankByCode(code);
      if (bank) {
        setInstitutionName(bank.name);
      }
    } else if (code === 'OTHER') {
      setInstitutionName('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isNameDuplicate && isNameDuplicate(accountName)) {
      setNameError(t('netWorth.validation.accountExists'));
      return;
    }
    
    const parsedBalance = parseFloat(balance);
    if (isNaN(parsedBalance)) {
      alert(t('netWorth.validation.validBalance'));
      return;
    }

    onSubmit({
      accountName,
      accountType,
      balance: parsedBalance,
      currency,
      note: note || undefined,
      institutionCode: institutionCode || undefined,
      institutionName: institutionName || undefined,
    });
  };

  // Account types that should show bank selector
  const showBankSelector = ['SAVINGS', 'CHECKING', 'BROKERAGE'].includes(accountType);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog net-worth-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>{initialData ? t('common.edit') : t('netWorth.log')} {t('netWorth.cashEntry')}</h2>
          <button className="dialog-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cash-name">{t('netWorth.accountName')}</label>
              <input
                id="cash-name"
                type="text"
                value={accountName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={t('netWorth.placeholders.mainSavings')}
                required
                className={nameError ? 'input-error' : ''}
              />
              {nameError && <span className="error-message">{nameError}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="cash-type">{t('netWorth.accountType')}</label>
              <select
                id="cash-type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as CashEntry['accountType'])}
              >
                {ACCOUNT_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bank/Institution selector - same as Asset Allocation */}
          {showBankSelector && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cash-institution">
                  {t('netWorth.bankInstitution')}{!settings.country && t('netWorth.setCountryInSettings')}
                </label>
                <SearchableSelect
                  options={[
                    { id: '', label: t('netWorth.selectBankBroker') },
                    ...countryBanks.map(bank => ({
                      id: bank.code,
                      label: `${bank.name}${bank.supportsOpenBanking ? ' 🔗' : ''}`,
                    })),
                    { id: 'OTHER', label: t('netWorth.otherSpecifyBelow') },
                  ]}
                  value={institutionCode}
                  onChange={(val) => handleInstitutionChange(val)}
                  searchThreshold={searchThreshold}
                  className="dialog-select"
                  ariaLabel={t('netWorth.bankOrInstitution')}
                />
              </div>
              
              {/* Custom institution name for "Other" */}
              {institutionCode === 'OTHER' && (
                <div className="form-group">
                  <label htmlFor="cash-institution-name">{t('netWorth.institutionName')}</label>
                  <input
                    id="cash-institution-name"
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder={t('netWorth.placeholders.localCreditUnion')}
                    className="dialog-input"
                  />
                </div>
              )}
            </div>
          )}
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="cash-balance">{t('netWorth.balance')}</label>
              <input
                id="cash-balance"
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="cash-currency">{t('netWorth.currency')}</label>
              <SearchableSelect
                options={SUPPORTED_CURRENCIES.map(c => ({
                  id: c.code,
                  label: `${c.symbol} ${c.name}`,
                }))}
                value={currency}
                onChange={(val) => setCurrency(val as SupportedCurrency)}
                searchThreshold={searchThreshold}
                ariaLabel={t('netWorth.currency')}
              />
            </div>
          </div>
          
          <div className="form-group full-width">
            <label htmlFor="cash-note">{t('netWorth.noteOptional')}</label>
            <input
              id="cash-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('netWorth.placeholders.addNote')}
            />
          </div>
          
          <div className="dialog-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-submit">{initialData ? t('common.update') : t('netWorth.log')} {t('netWorth.cashEntry')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Pension Dialog Component
interface PensionDialogProps {
  initialData?: PensionEntry;
  onSubmit: (data: Omit<PensionEntry, 'id'>) => void;
  onClose: () => void;
  defaultCurrency: SupportedCurrency;
  isNameDuplicate?: (name: string) => boolean;
  searchThreshold?: number;
}

function PensionDialog({ initialData, onSubmit, onClose, defaultCurrency, isNameDuplicate, searchThreshold }: PensionDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name || '');
  const [pensionType, setPensionType] = useState<PensionEntry['pensionType']>(initialData?.pensionType || 'STATE');
  const [currentValue, setCurrentValue] = useState(initialData?.currentValue?.toString() || '');
  const [currency, setCurrency] = useState<SupportedCurrency>(initialData?.currency || defaultCurrency);
  const [note, setNote] = useState(initialData?.note || '');
  const [nameError, setNameError] = useState<string | null>(null);

  const handleNameChange = (newName: string) => {
    setName(newName);
    if (isNameDuplicate && isNameDuplicate(newName)) {
      setNameError(t('netWorth.validation.pensionExists'));
    } else {
      setNameError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isNameDuplicate && isNameDuplicate(name)) {
      setNameError(t('netWorth.validation.pensionExists'));
      return;
    }
    
    const parsedValue = parseFloat(currentValue);
    if (isNaN(parsedValue) || parsedValue < 0) {
      alert(t('netWorth.validation.validPensionValue'));
      return;
    }

    onSubmit({
      name,
      pensionType,
      currentValue: parsedValue,
      currency,
      note: note || undefined,
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog net-worth-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>{initialData ? t('common.edit') : t('netWorth.log')} {t('netWorth.pension')}</h2>
          <button className="dialog-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pension-name">{t('netWorth.pensionName')}</label>
              <input
                id="pension-name"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={t('netWorth.placeholders.statePension')}
                required
                className={nameError ? 'input-error' : ''}
              />
              {nameError && <span className="error-message">{nameError}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="pension-type">{t('netWorth.pensionType')}</label>
              <select
                id="pension-type"
                value={pensionType}
                onChange={(e) => setPensionType(e.target.value as PensionEntry['pensionType'])}
              >
                {PENSION_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="pension-value">{t('netWorth.currentValue')}</label>
              <input
                id="pension-value"
                type="number"
                min="0"
                step="0.01"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="pension-currency">{t('netWorth.currency')}</label>
              <SearchableSelect
                options={SUPPORTED_CURRENCIES.map(c => ({
                  id: c.code,
                  label: `${c.symbol} ${c.name}`,
                }))}
                value={currency}
                onChange={(val) => setCurrency(val as SupportedCurrency)}
                searchThreshold={searchThreshold}
                ariaLabel={t('netWorth.currency')}
              />
            </div>
          </div>
          
          <div className="form-group full-width">
            <label htmlFor="pension-note">{t('netWorth.noteOptional')}</label>
            <input
              id="pension-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('netWorth.placeholders.addNote')}
            />
          </div>
          
          <div className="dialog-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-submit">{initialData ? t('common.update') : t('netWorth.log')} {t('netWorth.pension')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Operation Dialog Component
interface OperationDialogProps {
  onSubmit: (data: Omit<FinancialOperation, 'id'>) => void;
  onClose: () => void;
  defaultCurrency: SupportedCurrency;
  defaultDate: string;
  searchThreshold?: number;
}

function OperationDialog({ onSubmit, onClose, defaultCurrency, defaultDate, searchThreshold }: OperationDialogProps) {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(defaultDate || today);
  const [type, setType] = useState<OperationType>('DIVIDEND');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<SupportedCurrency>(defaultCurrency);
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert(t('netWorth.validation.amountGreaterThanZero'));
      return;
    }

    onSubmit({
      date,
      type,
      description,
      amount: parsedAmount,
      currency,
      note: note || undefined,
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog net-worth-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>{t('netWorth.logFinancialOperation')}</h2>
          <button className="dialog-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="op-date">{t('netWorth.date')}</label>
              <input
                id="op-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="op-type">{t('netWorth.operationType')}</label>
              <SearchableSelect
                options={OPERATION_TYPES.map(t => ({
                  id: t.id,
                  label: t.name,
                  icon: t.icon,
                }))}
                value={type}
                onChange={(val) => setType(val as OperationType)}
                searchThreshold={searchThreshold}
                ariaLabel={t('netWorth.operationType')}
                renderOption={(option) => (
                  <>
                    {option.icon && <MaterialIcon name={option.icon} size="small" />}
                    <span>{option.label}</span>
                  </>
                )}
                renderValue={(option) => option ? (
                  <>
                    {option.icon && <MaterialIcon name={option.icon} size="small" />}
                    <span>{option.label}</span>
                  </>
                ) : t('netWorth.selectType')}
              />
            </div>
          </div>
          
          <div className="form-group full-width">
            <label htmlFor="op-description">{t('netWorth.description')}</label>
            <input
              id="op-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('netWorth.placeholders.dividend')}
              required
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="op-amount">{t('netWorth.amount')}</label>
              <input
                id="op-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="op-currency">{t('netWorth.currency')}</label>
              <SearchableSelect
                options={SUPPORTED_CURRENCIES.map(c => ({
                  id: c.code,
                  label: `${c.symbol} ${c.name}`,
                }))}
                value={currency}
                onChange={(val) => setCurrency(val as SupportedCurrency)}
                searchThreshold={searchThreshold}
                ariaLabel={t('netWorth.currency')}
              />
            </div>
          </div>
          
          <div className="form-group full-width">
            <label htmlFor="op-note">{t('netWorth.noteOptional')}</label>
            <input
              id="op-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('netWorth.placeholders.addNote')}
            />
          </div>
          
          <div className="dialog-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-submit">{t('netWorth.logOperation')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
