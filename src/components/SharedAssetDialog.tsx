/**
 * Shared Asset Dialog Component
 * Used by both Asset Allocation Manager and Net Worth Tracker
 * Handles adding and editing assets with shares and price per share tracking
 */

import { useState, useEffect } from 'react';
import { Asset, AssetClass, SubAssetType, AllocationMode, MortgageData } from '../types/assetAllocation';
import { AssetHolding, VehicleDepreciation, DepreciationMethod, MortgageInfo } from '../types/netWorthTracker';
import { calculateMonthlyPayment, calculateRemainingYears } from '../utils/mortgageCalculator';
import { SupportedCurrency, SUPPORTED_CURRENCIES } from '../types/currency';
import { getUCITSWarning } from '../types/country';
import { BankInfo, getBanksByCountry, getBankByCode } from '../types/bank';
import { formatAssetName } from '../utils/allocationCalculator';
import { convertToEUR } from '../utils/currencyConverter';
import { loadSettings } from '../utils/cookieSettings';
import { lookupTicker } from '../utils/tickerLookup';
import { MaterialIcon } from './MaterialIcon';
import { SearchableSelect } from './SearchableSelect';

// Sub-types that should show bank/institution selector
const INSTITUTION_TYPES: SubAssetType[] = ['SAVINGS_ACCOUNT', 'CHECKING_ACCOUNT', 'BROKERAGE_ACCOUNT'];

interface SharedAssetDialogProps {
  mode: 'assetAllocation' | 'netWorthTracker';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void; // Asset or AssetHolding depending on mode
  initialData?: Asset | AssetHolding; // For editing
  defaultCurrency?: SupportedCurrency;
  isNameDuplicate?: (name: string) => boolean;
  existingAssets?: Asset[];
}

const SUB_ASSET_TYPES: Record<AssetClass, SubAssetType[]> = {
  STOCKS: ['ETF', 'SINGLE_STOCK', 'PRIVATE_EQUITY'],
  BONDS: ['ETF', 'SINGLE_BOND'],
  CASH: ['SAVINGS_ACCOUNT', 'CHECKING_ACCOUNT', 'BROKERAGE_ACCOUNT', 'MONEY_ETF'],
  CRYPTO: ['COIN'],
  REAL_ESTATE: ['PROPERTY', 'REIT'],
  COMMODITIES: ['PHYSICAL_GOLD', 'GOLD_ETC', 'SILVER_ETC', 'OIL_ETC', 'NATURAL_GAS_ETC', 'COPPER_ETC', 'PLATINUM_ETC', 'PALLADIUM_ETC', 'AGRICULTURAL_ETC', 'COMMODITY_ETF'],
  VEHICLE: ['CAR', 'MOTORCYCLE', 'BOAT', 'OTHER_VEHICLE'],
  COLLECTIBLE: ['WATCH', 'WINE', 'JEWELRY', 'SPORTS_MEMORABILIA', 'OTHER_COLLECTIBLE'],
  ART: ['PAINTING', 'SCULPTURE', 'DIGITAL_ART', 'OTHER_ART'],
};

// Sub-types that can use SET mode (Asset Allocation only)
const SET_MODE_ALLOWED: SubAssetType[] = ['SAVINGS_ACCOUNT', 'CHECKING_ACCOUNT', 'BROKERAGE_ACCOUNT', 'MONEY_ETF', 'PROPERTY', 'CAR', 'MOTORCYCLE', 'BOAT', 'OTHER_VEHICLE', 'WATCH', 'WINE', 'JEWELRY', 'SPORTS_MEMORABILIA', 'OTHER_COLLECTIBLE', 'PAINTING', 'SCULPTURE', 'DIGITAL_ART', 'OTHER_ART', 'PHYSICAL_GOLD'];

// Sub-types that require ISIN code (including MONEY_ETF now)
const ISIN_REQUIRED: SubAssetType[] = ['ETF', 'SINGLE_STOCK', 'SINGLE_BOND', 'REIT', 'MONEY_ETF'];

// Sub-types that don't need ticker (PRIVATE_EQUITY added - no ticker)
const NO_TICKER_REQUIRED: SubAssetType[] = ['SAVINGS_ACCOUNT', 'CHECKING_ACCOUNT', 'BROKERAGE_ACCOUNT', 'PROPERTY', 'PRIVATE_EQUITY', 'CAR', 'MOTORCYCLE', 'BOAT', 'OTHER_VEHICLE', 'WATCH', 'WINE', 'JEWELRY', 'SPORTS_MEMORABILIA', 'OTHER_COLLECTIBLE', 'PAINTING', 'SCULPTURE', 'DIGITAL_ART', 'OTHER_ART', 'PHYSICAL_GOLD'];

// Sub-types that show direct value input instead of shares/price (like property)
const VALUE_ONLY_TYPES: SubAssetType[] = ['PROPERTY', 'CAR', 'MOTORCYCLE', 'BOAT', 'OTHER_VEHICLE', 'WATCH', 'WINE', 'JEWELRY', 'SPORTS_MEMORABILIA', 'OTHER_COLLECTIBLE', 'PAINTING', 'SCULPTURE', 'DIGITAL_ART', 'OTHER_ART', 'PHYSICAL_GOLD'];

// Sub-types that should show UCITS warning (only ETFs)
const UCITS_WARNING_TYPES: SubAssetType[] = ['ETF', 'MONEY_ETF'];

// Get ticker label based on sub-asset type
const getTickerLabel = (subAssetType: SubAssetType): string => {
  if (subAssetType === 'SINGLE_BOND') {
    return 'Nation Code *';
  }
  if (NO_TICKER_REQUIRED.includes(subAssetType)) {
    return 'Reference (optional)';
  }
  return 'Ticker/Symbol *';
};

// Map Asset Allocation AssetClass to Net Worth Tracker assetClass
const mapToNetWorthAssetClass = (assetClass: AssetClass, subAssetType: SubAssetType): AssetHolding['assetClass'] => {
  if (assetClass === 'STOCKS') {
    if (subAssetType === 'PRIVATE_EQUITY') return 'PRIVATE_EQUITY';
    return 'STOCKS';
  }
  if (assetClass === 'BONDS') return 'BONDS';
  if (assetClass === 'REAL_ESTATE') {
    return subAssetType === 'REIT' ? 'ETF' : 'REAL_ESTATE';
  }
  if (assetClass === 'CRYPTO') return 'CRYPTO';
  if (assetClass === 'COMMODITIES') return 'COMMODITIES';
  if (assetClass === 'VEHICLE') return 'VEHICLE';
  if (assetClass === 'COLLECTIBLE') return 'COLLECTIBLE';
  if (assetClass === 'ART') return 'ART';
  if (assetClass === 'CASH') return 'OTHER'; // Cash as assets treated as OTHER
  return 'OTHER';
};

// Map Net Worth Tracker assetClass to Asset Allocation
const mapFromNetWorthAssetClass = (assetClass: AssetHolding['assetClass']): { assetClass: AssetClass, subAssetType: SubAssetType } => {
  if (assetClass === 'STOCKS') return { assetClass: 'STOCKS', subAssetType: 'ETF' };
  if (assetClass === 'BONDS') return { assetClass: 'BONDS', subAssetType: 'ETF' };
  if (assetClass === 'ETF') return { assetClass: 'STOCKS', subAssetType: 'ETF' };
  if (assetClass === 'CRYPTO') return { assetClass: 'CRYPTO', subAssetType: 'COIN' };
  if (assetClass === 'REAL_ESTATE') return { assetClass: 'REAL_ESTATE', subAssetType: 'PROPERTY' };
  if (assetClass === 'PRIVATE_EQUITY') return { assetClass: 'STOCKS', subAssetType: 'PRIVATE_EQUITY' };
  if (assetClass === 'COMMODITIES') return { assetClass: 'COMMODITIES', subAssetType: 'COMMODITY_ETF' };
  if (assetClass === 'VEHICLE') return { assetClass: 'VEHICLE', subAssetType: 'CAR' };
  if (assetClass === 'COLLECTIBLE') return { assetClass: 'COLLECTIBLE', subAssetType: 'WATCH' };
  if (assetClass === 'ART') return { assetClass: 'ART', subAssetType: 'PAINTING' };
  return { assetClass: 'STOCKS', subAssetType: 'ETF' };
};

export const SharedAssetDialog: React.FC<SharedAssetDialogProps> = ({
  mode,
  isOpen,
  onClose,
  onSubmit,
  initialData,
  defaultCurrency = 'EUR',
  isNameDuplicate,
  existingAssets,
}) => {
  // Determine if editing
  const isEditing = Boolean(initialData);
  
  // Initialize form state
  const [assetClass, setAssetClass] = useState<AssetClass>('STOCKS');
  const [subAssetType, setSubAssetType] = useState<SubAssetType>('ETF');
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [isin, setIsin] = useState('');
  const [shares, setShares] = useState<string>('1');
  const [pricePerShare, setPricePerShare] = useState<string>('');
  const [acquisitionPrice, setAcquisitionPrice] = useState<string>('');
  const [currency, setCurrency] = useState<SupportedCurrency>(defaultCurrency);
  const [targetMode, setTargetMode] = useState<AllocationMode>('PERCENTAGE');
  const [targetPercent, setTargetPercent] = useState<string>('0');
  const [note, setNote] = useState('');
  const [institutionCode, setInstitutionCode] = useState<string>('');
  const [institutionName, setInstitutionName] = useState<string>('');
  const [isPrimaryResidence, setIsPrimaryResidence] = useState(false);

  // Vehicle depreciation state
  const [enableDepreciation, setEnableDepreciation] = useState(false);
  const [depMethod, setDepMethod] = useState<DepreciationMethod>('STRAIGHT_LINE');
  const [depPurchasePrice, setDepPurchasePrice] = useState<string>('');
  const [depPurchaseDate, setDepPurchaseDate] = useState<string>('');
  const [depSalvageValue, setDepSalvageValue] = useState<string>('0');
  const [depUsefulLife, setDepUsefulLife] = useState<string>('10');
  const [depAnnualRate, setDepAnnualRate] = useState<string>('20');
  const [depCurrentDepreciation, setDepCurrentDepreciation] = useState<string>('');

  // Mortgage state
  const [enableMortgage, setEnableMortgage] = useState(false);
  const [mortPrincipal, setMortPrincipal] = useState<string>('');
  const [mortCurrentBalance, setMortCurrentBalance] = useState<string>('');
  const [mortInterestRate, setMortInterestRate] = useState<string>('');
  const [mortTermYears, setMortTermYears] = useState<string>('30');
  const [mortStartDate, setMortStartDate] = useState<string>('');
  const [mortLender, setMortLender] = useState<string>('');

  // Ticker lookup state
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);

  // Dropdown vs manual entry state for name/ticker
  const [isNewAsset, setIsNewAsset] = useState(true);
  const [isNewTicker, setIsNewTicker] = useState(true);

  // Get fallback rates from settings
  const settings = loadSettings();

  // Get banks for the user's country
  const countryBanks: BankInfo[] = settings.country ? getBanksByCountry(settings.country) : [];

  // Initialize form with initial data
  useEffect(() => {
    if (initialData) {
      if (mode === 'assetAllocation') {
        const asset = initialData as Asset;
        setAssetClass(asset.assetClass);
        setSubAssetType(asset.subAssetType);
        setName(asset.name);
        setTicker(asset.ticker);
        setIsin(asset.isin || '');
        setShares(asset.shares?.toString() || '1');
        setPricePerShare(asset.pricePerShare?.toString() || '');
        setAcquisitionPrice(asset.acquisitionPrice?.toString() || '');
        setCurrency(asset.originalCurrency || 'EUR');
        setTargetMode(asset.targetMode);
        setTargetPercent(asset.targetPercent?.toString() || '0');
        setInstitutionCode(asset.institutionCode || '');
        setInstitutionName(asset.institutionName || '');
        setIsPrimaryResidence(asset.isPrimaryResidence || false);
        // Load mortgage data for editing
        if (asset.mortgageData) {
          setEnableMortgage(true);
          setMortPrincipal(asset.mortgageData.principalAmount.toString());
          setMortCurrentBalance(asset.mortgageData.currentBalance.toString());
          setMortInterestRate(asset.mortgageData.interestRate.toString());
          setMortTermYears(asset.mortgageData.termYears.toString());
          setMortStartDate(asset.mortgageData.startDate);
          setMortLender(asset.mortgageData.lender || '');
        } else {
          setEnableMortgage(false);
        }
      } else {
        // Net Worth Tracker mode
        const holding = initialData as AssetHolding;
        const mapped = mapFromNetWorthAssetClass(holding.assetClass);
        setAssetClass(mapped.assetClass);
        setSubAssetType(mapped.subAssetType);
        setName(holding.name);
        setTicker(holding.ticker);
        setShares(holding.shares.toString());
        setPricePerShare(holding.pricePerShare.toString());
        setAcquisitionPrice(holding.acquisitionPrice?.toString() || '');
        setCurrency(holding.currency);
        setNote(holding.note || '');
        setInstitutionCode('');
        setInstitutionName('');
        setIsPrimaryResidence(holding.isPrimaryResidence || false);
        // Load vehicle depreciation for editing
        if (holding.vehicleDepreciation) {
          setEnableDepreciation(true);
          setDepMethod(holding.vehicleDepreciation.method);
          setDepPurchasePrice(holding.vehicleDepreciation.purchasePrice.toString());
          setDepPurchaseDate(holding.vehicleDepreciation.purchaseDate);
          setDepSalvageValue(holding.vehicleDepreciation.salvageValue.toString());
          setDepUsefulLife(holding.vehicleDepreciation.usefulLifeYears.toString());
          setDepAnnualRate(holding.vehicleDepreciation.annualDepreciationRate?.toString() || '20');
          setDepCurrentDepreciation(holding.vehicleDepreciation.currentDepreciation?.toString() || '');
        } else {
          setEnableDepreciation(false);
        }
        // Load mortgage info for editing
        if (holding.mortgageInfo) {
          setEnableMortgage(true);
          setMortPrincipal(holding.mortgageInfo.principalAmount.toString());
          setMortCurrentBalance(holding.mortgageInfo.currentBalance.toString());
          setMortInterestRate(holding.mortgageInfo.interestRate.toString());
          setMortTermYears(holding.mortgageInfo.termYears.toString());
          setMortStartDate(holding.mortgageInfo.startDate);
          setMortLender(holding.mortgageInfo.lender || '');
        } else {
          setEnableMortgage(false);
        }
      }
    } else {
      // Reset for new entry
      setAssetClass('STOCKS');
      setSubAssetType('ETF');
      setName('');
      setTicker('');
      setIsin('');
      setShares('1');
      setPricePerShare('');
      setAcquisitionPrice('');
      setCurrency(defaultCurrency);
      setTargetMode('PERCENTAGE');
      setTargetPercent('0');
      setNote('');
      setInstitutionCode('');
      setInstitutionName('');
      setIsPrimaryResidence(false);
      setLookupStatus(null);
      setIsLookingUp(false);
      setEnableDepreciation(false);
      setDepMethod('STRAIGHT_LINE');
      setDepPurchasePrice('');
      setDepPurchaseDate('');
      setDepSalvageValue('0');
      setDepUsefulLife('10');
      setDepAnnualRate('20');
      setDepCurrentDepreciation('');
      setEnableMortgage(false);
      setMortPrincipal('');
      setMortCurrentBalance('');
      setMortInterestRate('');
      setMortTermYears('30');
      setMortStartDate('');
      setMortLender('');
    }
  }, [initialData, mode, defaultCurrency]);

  // Computed current value
  const currentValue = (() => {
    const sharesNum = parseFloat(shares) || 0;
    const priceNum = parseFloat(pricePerShare) || 0;
    if (sharesNum > 0 && priceNum > 0) {
      return (sharesNum * priceNum).toFixed(2);
    }
    return '0';
  })();

  // Asset classes that default to OFF target mode
  const OFF_TARGET_DEFAULT_CLASSES: AssetClass[] = ['VEHICLE', 'COLLECTIBLE', 'ART'];

  const handleAssetClassChange = (newClass: AssetClass) => {
    setAssetClass(newClass);
    const availableSubTypes = SUB_ASSET_TYPES[newClass];
    if (availableSubTypes.length > 0) {
      setSubAssetType(availableSubTypes[0]);
    }
    setIsin('');
    // Default to OFF target mode for vehicle, collectible, and art
    if (OFF_TARGET_DEFAULT_CLASSES.includes(newClass)) {
      setTargetMode('OFF');
      setTargetPercent('0');
    } else if (!isEditing) {
      setTargetMode('PERCENTAGE');
    }
    // Reset institution when changing asset class
    if (!INSTITUTION_TYPES.includes(SUB_ASSET_TYPES[newClass][0])) {
      setInstitutionCode('');
      setInstitutionName('');
    }
  };

  const handleSubAssetTypeChange = (newType: SubAssetType) => {
    setSubAssetType(newType);
    setIsin('');
    if (NO_TICKER_REQUIRED.includes(newType)) {
      setTicker('');
    }
    // Reset institution when changing to a type that doesn't need it
    if (!INSTITUTION_TYPES.includes(newType)) {
      setInstitutionCode('');
      setInstitutionName('');
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

  const handleSharesChange = (value: string) => {
    setShares(value);
  };

  // Map Yahoo Finance currency to SupportedCurrency
  const mapYahooCurrency = (yahooCurrency: string | undefined): SupportedCurrency | null => {
    if (!yahooCurrency) return null;
    const upper = yahooCurrency.toUpperCase();
    const supported = SUPPORTED_CURRENCIES.find(c => c.code === upper);
    return supported ? supported.code : null;
  };

  // Auto-fill fields from an existing asset
  const autoFillFromAsset = (matchingAsset: Asset) => {
    setName(matchingAsset.name);
    setTicker(matchingAsset.ticker);
    setIsin(matchingAsset.isin || '');
    setAssetClass(matchingAsset.assetClass);
    setSubAssetType(matchingAsset.subAssetType);
    setCurrency(matchingAsset.originalCurrency || defaultCurrency);
    // Don't set shares — user needs to enter their own
    // Trigger lookupTicker to get current market price
    if (matchingAsset.ticker) {
      lookupTicker(matchingAsset.ticker).then(result => {
        if (!result.error && result.price > 0) {
          setPricePerShare(result.price.toString());
        }
      });
    }
  };

  // Fetch price and metadata from Yahoo Finance for the current ticker
  const handleTickerLookup = async () => {
    if (!ticker.trim()) {
      setLookupStatus('Enter a ticker first');
      return;
    }

    setIsLookingUp(true);
    setLookupStatus(null);

    const result = await lookupTicker(ticker);

    if (result.error) {
      setLookupStatus(`⚠ ${result.error}`);
      setIsLookingUp(false);
      return;
    }

    // Auto-fill price per share
    setPricePerShare(result.price.toString());

    // Auto-fill name if empty
    if (!name.trim() && result.name) {
      setName(result.name);
    }

    // Auto-fill currency if available and supported
    const mappedCurrency = mapYahooCurrency(result.currency);
    if (mappedCurrency) {
      setCurrency(mappedCurrency);
    }

    // Update ticker to canonical form
    if (result.ticker) {
      setTicker(result.ticker);
    }

    const parts = [`${result.currency || ''} ${result.price.toFixed(2)}`];
    if (result.exchange) parts.push(result.exchange);
    setLookupStatus(`✓ ${parts.join(' · ')}`);
    setIsLookingUp(false);
  };

  const buildVehicleDepreciation = (): VehicleDepreciation => {
    return {
      method: depMethod,
      purchasePrice: parseFloat(depPurchasePrice) || 0,
      purchaseDate: depPurchaseDate,
      salvageValue: parseFloat(depSalvageValue) || 0,
      usefulLifeYears: parseFloat(depUsefulLife) || 10,
      annualDepreciationRate: depMethod === 'DECLINING_BALANCE' ? (parseFloat(depAnnualRate) || 20) : undefined,
      currentDepreciation: depMethod === 'MANUAL' ? (parseFloat(depCurrentDepreciation) || undefined) : undefined,
    };
  };

  const buildMortgageInfo = (): MortgageInfo => {
    const principal = parseFloat(mortPrincipal) || 0;
    const balance = parseFloat(mortCurrentBalance) || 0;
    const rate = parseFloat(mortInterestRate) || 0;
    const term = parseFloat(mortTermYears) || 30;
    const monthly = calculateMonthlyPayment(principal, rate, term);
    const remaining = calculateRemainingYears(balance, monthly, rate);
    return {
      principalAmount: principal,
      currentBalance: balance,
      interestRate: rate,
      termYears: term,
      remainingYears: remaining,
      monthlyPayment: monthly,
      startDate: mortStartDate,
      lender: mortLender.trim() || undefined,
    };
  };

  const buildMortgageData = (propertyValueEUR: number): MortgageData => {
    const info = buildMortgageInfo();
    return {
      ...info,
      propertyValue: propertyValueEUR,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Please enter an asset name');
      return;
    }

    // Check duplicate name
    if (isNameDuplicate && isNameDuplicate(name.trim())) {
      alert('An asset with this name already exists');
      return;
    }

    // Check if ticker is required
    const needsTicker = !NO_TICKER_REQUIRED.includes(subAssetType);
    if (needsTicker && !ticker.trim()) {
      alert(`Please enter a ${subAssetType === 'SINGLE_BOND' ? 'nation code' : 'ticker/symbol'}`);
      return;
    }

    // Check if ISIN is required (now includes MONEY_ETF)
    if (ISIN_REQUIRED.includes(subAssetType) && !isin.trim()) {
      alert('Please enter an ISIN code');
      return;
    }

    // Shares and pricePerShare are required EXCEPT for cash accounts (not MONEY_ETF) and value-only assets
    const isCashAccount = mode === 'assetAllocation' && assetClass === 'CASH' && subAssetType !== 'MONEY_ETF';
    const isValueOnlyAsset = VALUE_ONLY_TYPES.includes(subAssetType);
    
    if (!isCashAccount && !isValueOnlyAsset) {
      if (!shares.trim() || parseFloat(shares) <= 0) {
        alert('Please enter a valid number of shares');
        return;
      }
      if (!pricePerShare.trim() || parseFloat(pricePerShare) <= 0) {
        alert('Please fetch the price first by entering a ticker and clicking the fetch button');
        return;
      }
    }

    // Generate ticker if not provided
    const generatedTicker = ticker.trim().toUpperCase() || 
      `${name.trim().substring(0, 4).toUpperCase()}${Date.now().toString().slice(-4)}`;

    // Calculate value differently for cash accounts (not MONEY_ETF) and value-only assets
    // For these types, value is directly entered (not shares × price)
    let sharesNum = parseFloat(shares) || 1;
    let priceNum = parseFloat(pricePerShare) || 0;
    let valueNum: number;
    
    if (isCashAccount || isValueOnlyAsset) {
      // For cash and value-only assets: value is entered directly
      // Store as shares=1, pricePerShare=value for consistent data model
      valueNum = parseFloat(shares) || 0; // shares field is repurposed for value input
      sharesNum = 1;
      priceNum = valueNum;
    } else {
      valueNum = sharesNum * priceNum;
    }

    // Convert to EUR if needed
    const valueInEUR = currency === 'EUR'
      ? valueNum
      : convertToEUR(valueNum, currency, settings.currencySettings.fallbackRates);

    if (mode === 'assetAllocation') {
      // Asset Allocation mode
      const acqPriceNum = parseFloat(acquisitionPrice) || undefined;
      const asset: Omit<Asset, 'id'> & { id?: string } = {
        ...(initialData && { id: (initialData as Asset).id }),
        name: name.trim(),
        ticker: generatedTicker,
        isin: ISIN_REQUIRED.includes(subAssetType) ? isin.trim().toUpperCase() : undefined,
        assetClass,
        subAssetType,
        currentValue: valueInEUR,
        shares: sharesNum,
        pricePerShare: priceNum,
        acquisitionPrice: acqPriceNum,
        marketPrice: priceNum,
        originalCurrency: currency !== 'EUR' ? currency : undefined,
        originalValue: currency !== 'EUR' ? valueNum : undefined,
        targetMode,
        targetPercent: targetMode === 'PERCENTAGE' ? (parseFloat(targetPercent) || 0) : undefined,
        targetValue: targetMode === 'SET' ? valueInEUR : undefined,
        institutionCode: INSTITUTION_TYPES.includes(subAssetType) && institutionCode ? institutionCode : undefined,
        institutionName: INSTITUTION_TYPES.includes(subAssetType) && institutionName ? institutionName.trim() : undefined,
        isPrimaryResidence: subAssetType === 'PROPERTY' ? isPrimaryResidence : undefined,
        mortgageData: subAssetType === 'PROPERTY' && enableMortgage ? buildMortgageData(valueInEUR) : undefined,
      };
      
      onSubmit(asset);
    } else {
      // Net Worth Tracker mode
      const acqPriceNum = parseFloat(acquisitionPrice) || undefined;
      const holding: Omit<AssetHolding, 'id'> & { id?: string } = {
        ...(initialData && { id: (initialData as AssetHolding).id }),
        name: name.trim(),
        ticker: generatedTicker,
        shares: sharesNum,
        pricePerShare: priceNum,
        acquisitionPrice: acqPriceNum,
        currency,
        assetClass: mapToNetWorthAssetClass(assetClass, subAssetType),
        note: note.trim() || undefined,
        isPrimaryResidence: subAssetType === 'PROPERTY' ? isPrimaryResidence : undefined,
        vehicleDepreciation: assetClass === 'VEHICLE' && enableDepreciation ? buildVehicleDepreciation() : undefined,
        mortgageInfo: subAssetType === 'PROPERTY' && enableMortgage ? buildMortgageInfo() : undefined,
      };
      
      onSubmit(holding);
    }

    // Reset form
    setName('');
    setTicker('');
    setIsin('');
    setShares('1');
    setPricePerShare('');
    setAcquisitionPrice('');
    setCurrency(defaultCurrency);
    setTargetPercent('0');
    setNote('');
    setInstitutionCode('');
    setInstitutionName('');
    setIsPrimaryResidence(false);
    setEnableDepreciation(false);
    setEnableMortgage(false);
    setIsNewAsset(true);
    setIsNewTicker(true);
    setLookupStatus(null);
    onClose();
  };

  if (!isOpen) return null;

  const needsTicker = !NO_TICKER_REQUIRED.includes(subAssetType);
  const needsIsin = ISIN_REQUIRED.includes(subAssetType);
  const showTargetSettings = mode === 'assetAllocation';
  const showInstitution = mode === 'assetAllocation' && INSTITUTION_TYPES.includes(subAssetType);
  
  // UCITS warning for EU users (only for ETFs)
  const showUcitsWarning = UCITS_WARNING_TYPES.includes(subAssetType);
  const ucitsWarning = showUcitsWarning && needsIsin ? getUCITSWarning(isin, settings.country) : null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{isEditing ? 'Edit' : 'Add'} Asset</h3>
          <button className="dialog-close" onClick={onClose}><MaterialIcon name="close" size="small" /></button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-row">
            <div className="form-group">
              <label>Asset Class *</label>
              <select
                value={assetClass}
                onChange={(e) => handleAssetClassChange(e.target.value as AssetClass)}
                className="dialog-select"
              >
                <option value="STOCKS">Stocks</option>
                <option value="BONDS">Bonds</option>
                <option value="CASH">Cash</option>
                <option value="CRYPTO">Crypto</option>
                <option value="REAL_ESTATE">Real Estate</option>
                <option value="COMMODITIES">Commodities</option>
                <option value="VEHICLE">Vehicle</option>
                <option value="COLLECTIBLE">Collectible</option>
                <option value="ART">Art</option>
              </select>
            </div>

            <div className="form-group">
              <label>Type *</label>
              <select
                value={subAssetType}
                onChange={(e) => handleSubAssetTypeChange(e.target.value as SubAssetType)}
                className="dialog-select"
              >
                {SUB_ASSET_TYPES[assetClass].map(type => (
                  <option key={type} value={type}>
                    {formatAssetName(type)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Asset Name *</label>
            {!isEditing && existingAssets && existingAssets.length > 0 && !isNewAsset ? (
              <SearchableSelect
                options={[
                  { id: '__new__', label: '+ Add new asset...' },
                  ...existingAssets.map(a => ({ id: a.id, label: a.name })),
                ]}
                value={existingAssets.find(a => a.name === name)?.id || '__new__'}
                onChange={(val) => {
                  if (val === '__new__') {
                    setIsNewAsset(true);
                    setName('');
                  } else {
                    const match = existingAssets.find(a => a.id === val);
                    if (match) {
                      autoFillFromAsset(match);
                      setIsNewTicker(false);
                    }
                  }
                }}
                searchThreshold={settings.searchThreshold ?? 8}
                className="dialog-select"
                ariaLabel="Select existing asset or add new"
              />
            ) : (
              <>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., S&P 500 Index Fund"
                  className="dialog-input"
                  required
                />
                {!isEditing && existingAssets && existingAssets.length > 0 && (
                  <button
                    type="button"
                    className="ticker-fetch-btn"
                    style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
                    onClick={() => setIsNewAsset(false)}
                    title="Select from existing assets"
                  >
                    Choose existing
                  </button>
                )}
              </>
            )}
          </div>

          {/* Bank/Institution selector for cash and brokerage accounts */}
          {showInstitution && (
            <div className="form-row">
              <div className="form-group">
                <label>
                  Bank/Institution{!settings.country && ' (Set country in Settings)'}
                </label>
                <SearchableSelect
                  options={[
                    { id: '', label: 'Select Bank/Broker...' },
                    ...countryBanks.map(bank => ({
                      id: bank.code,
                      label: `${bank.name}${bank.supportsOpenBanking ? ' 🔗' : ''}`,
                    })),
                    { id: 'OTHER', label: 'Other (Custom Name)' },
                  ]}
                  value={institutionCode}
                  onChange={(val) => handleInstitutionChange(val)}
                  searchThreshold={settings.searchThreshold ?? 8}
                  className="dialog-select"
                  ariaLabel="Bank or institution"
                />
                {institutionCode && getBankByCode(institutionCode)?.supportsOpenBanking && (
                  <div className="openbanking-info">
                    <MaterialIcon name="link" size="small" /> Supports OpenBanking PSD2
                  </div>
                )}
              </div>
              {institutionCode === 'OTHER' && (
                <div className="form-group">
                  <label>Institution Name *</label>
                  <input
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder="e.g., Local Credit Union"
                    className="dialog-input"
                  />
                </div>
              )}
            </div>
          )}

          {/* Ticker/ISIN row - hide ticker for PRIVATE_EQUITY */}
          <div className="form-row">
            {subAssetType !== 'PRIVATE_EQUITY' && (
              <div className="form-group">
                <label>{getTickerLabel(subAssetType)}</label>
                {!isEditing && existingAssets && existingAssets.length > 0 && !isNewTicker ? (
                  <>
                    <SearchableSelect
                      options={[
                        { id: '__new__', label: '+ Enter new ticker...' },
                        ...Array.from(new Map(
                          existingAssets
                            .filter(a => a.ticker && a.ticker.trim().length > 0)
                            .map(a => [a.ticker.trim().toUpperCase(), a])
                        ).entries()).map(([tickerKey]) => ({
                          id: tickerKey,
                          label: tickerKey,
                        })),
                      ]}
                      value={ticker.trim().toUpperCase() || '__new__'}
                      onChange={(val) => {
                        if (val === '__new__') {
                          setIsNewTicker(true);
                          setTicker('');
                          setLookupStatus(null);
                        } else {
                          const match = existingAssets!.find(
                            a => a.ticker.trim().toUpperCase() === val
                          );
                          if (match) {
                            autoFillFromAsset(match);
                            setIsNewAsset(true);
                          }
                          setTicker(val);
                          setLookupStatus(null);
                        }
                      }}
                      searchThreshold={settings.searchThreshold ?? 8}
                      className="dialog-select"
                      ariaLabel="Select existing ticker or enter new"
                    />
                    {lookupStatus && (
                      <div className={`ticker-lookup-status ${lookupStatus.startsWith('⚠') ? 'error' : 'success'}`}>
                        {lookupStatus}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="ticker-input-row">
                      <input
                        type="text"
                        value={ticker}
                        onChange={(e) => { setTicker(e.target.value); setLookupStatus(null); }}
                        onBlur={() => { if (ticker.trim() && needsTicker) handleTickerLookup(); }}
                        placeholder={needsTicker ? "e.g., SPY" : "Optional"}
                        className="dialog-input"
                      />
                      {needsTicker && (
                        <button
                          type="button"
                          className="ticker-fetch-btn"
                          onClick={handleTickerLookup}
                          disabled={isLookingUp || !ticker.trim()}
                          title="Fetch price and info from Yahoo Finance"
                        >
                          <MaterialIcon name={isLookingUp ? 'hourglass_empty' : 'download'} size="small" />
                        </button>
                      )}
                    </div>
                    {!isEditing && existingAssets && existingAssets.length > 0 && (
                      <button
                        type="button"
                        className="ticker-fetch-btn"
                        style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
                        onClick={() => setIsNewTicker(false)}
                        title="Select from existing tickers"
                      >
                        Choose existing
                      </button>
                    )}
                    {lookupStatus && (
                      <div className={`ticker-lookup-status ${lookupStatus.startsWith('⚠') ? 'error' : 'success'}`}>
                        {lookupStatus}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {needsIsin && (
              <div className="form-group">
                <label>ISIN *</label>
                <input
                  type="text"
                  value={isin}
                  onChange={(e) => setIsin(e.target.value)}
                  placeholder="e.g., US78462F1030"
                  className="dialog-input"
                  required
                />
                {ucitsWarning && (
                  <div className="ucits-warning" role="alert">
                    <MaterialIcon name="warning" size="small" /> {ucitsWarning}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Only show shares and price fields for non-cash accounts, non-value-only assets, or for MONEY_ETF */}
          {(assetClass !== 'CASH' || subAssetType === 'MONEY_ETF') && !VALUE_ONLY_TYPES.includes(subAssetType) && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Number of Shares *</label>
                  <input
                    type="number"
                    value={shares}
                    onChange={(e) => handleSharesChange(e.target.value)}
                    placeholder="e.g., 100"
                    className="dialog-input"
                    min="0"
                    step="any"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Price per Share (Market)</label>
                  <input
                    type="text"
                    value={pricePerShare ? `${parseFloat(pricePerShare).toFixed(2)}` : '—'}
                    className="dialog-input dialog-input-calculated"
                    disabled
                    title="Fetched automatically from Yahoo Finance"
                  />
                  {!pricePerShare && needsTicker && ticker.trim() && (
                    <span className="setting-help" style={{ color: 'var(--warning)' }}>
                      Click the fetch button next to the ticker to get the price
                    </span>
                  )}
                </div>
              </div>

              {/* Acquisition price — editable, shown for share-based assets */}
              {needsTicker && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Acquisition Price per Share</label>
                    <input
                      type="number"
                      value={acquisitionPrice}
                      onChange={(e) => setAcquisitionPrice(e.target.value)}
                      placeholder={pricePerShare ? `Defaults to ${parseFloat(pricePerShare).toFixed(2)}` : 'Price you paid'}
                      className="dialog-input"
                      min="0"
                      step="any"
                      title="The price at which you originally bought this asset"
                    />
                    <span className="setting-help">
                      Leave blank to use market price as acquisition price
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Value is directly editable for cash accounts (not MONEY_ETF) and PROPERTY assets */}
          {(() => {
            const isValueDirectlyEditable = (assetClass === 'CASH' && subAssetType !== 'MONEY_ETF') || VALUE_ONLY_TYPES.includes(subAssetType);
            const showCalculatedLabel = !isValueDirectlyEditable && mode === 'assetAllocation';
            const showCalculatedLabelNetWorth = !isValueDirectlyEditable && mode === 'netWorthTracker';
            
            return (
              <div className="form-row">
                <div className="form-group">
                  <label>Current Value {showCalculatedLabel || showCalculatedLabelNetWorth ? '(Calculated)' : ''} *</label>
                  <input
                    type={isValueDirectlyEditable ? 'number' : 'text'}
                    value={currentValue}
                    onChange={isValueDirectlyEditable ? (e) => {
                      setShares(e.target.value);
                      setPricePerShare('1');
                    } : undefined}
                    className="dialog-input dialog-input-calculated"
                    disabled={!isValueDirectlyEditable}
                    placeholder={isValueDirectlyEditable ? (VALUE_ONLY_TYPES.includes(subAssetType) ? 'Enter estimated value' : 'Enter cash amount') : ''}
                    min={isValueDirectlyEditable ? '0' : undefined}
                    step={isValueDirectlyEditable ? 'any' : undefined}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Currency *</label>
                  <SearchableSelect
                    options={SUPPORTED_CURRENCIES.map(curr => ({
                      id: curr.code,
                      label: curr.code,
                    }))}
                    value={currency}
                    onChange={(val) => setCurrency(val as SupportedCurrency)}
                    searchThreshold={settings.searchThreshold ?? 8}
                    className="dialog-select"
                    ariaLabel="Currency"
                  />
                </div>
              </div>
            );
          })()}

          {/* Vehicle Depreciation section - shown for VEHICLE asset class */}
          {assetClass === 'VEHICLE' && (
            <fieldset className="dialog-fieldset">
              <legend>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={enableDepreciation}
                    onChange={(e) => setEnableDepreciation(e.target.checked)}
                  />
                  Track Depreciation
                </label>
              </legend>
              {enableDepreciation && (
                <div className="fieldset-content">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Method *</label>
                      <select
                        value={depMethod}
                        onChange={(e) => setDepMethod(e.target.value as DepreciationMethod)}
                        className="dialog-select"
                      >
                        <option value="STRAIGHT_LINE">Straight Line</option>
                        <option value="DECLINING_BALANCE">Declining Balance</option>
                        <option value="MANUAL">Manual</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Purchase Price *</label>
                      <input
                        type="number"
                        value={depPurchasePrice}
                        onChange={(e) => setDepPurchasePrice(e.target.value)}
                        placeholder="e.g., 25000"
                        className="dialog-input"
                        min="0"
                        step="any"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Purchase Date *</label>
                      <input
                        type="date"
                        value={depPurchaseDate}
                        onChange={(e) => setDepPurchaseDate(e.target.value)}
                        className="dialog-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Useful Life (years) *</label>
                      <input
                        type="number"
                        value={depUsefulLife}
                        onChange={(e) => setDepUsefulLife(e.target.value)}
                        placeholder="e.g., 10"
                        className="dialog-input"
                        min="1"
                        step="1"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Salvage Value</label>
                      <input
                        type="number"
                        value={depSalvageValue}
                        onChange={(e) => setDepSalvageValue(e.target.value)}
                        placeholder="e.g., 3000"
                        className="dialog-input"
                        min="0"
                        step="any"
                      />
                    </div>
                    {depMethod === 'DECLINING_BALANCE' && (
                      <div className="form-group">
                        <label>Annual Rate (%)</label>
                        <input
                          type="number"
                          value={depAnnualRate}
                          onChange={(e) => setDepAnnualRate(e.target.value)}
                          placeholder="e.g., 20"
                          className="dialog-input"
                          min="0"
                          max="100"
                          step="0.1"
                        />
                      </div>
                    )}
                    {depMethod === 'MANUAL' && (
                      <div className="form-group">
                        <label>Accumulated Depreciation</label>
                        <input
                          type="number"
                          value={depCurrentDepreciation}
                          onChange={(e) => setDepCurrentDepreciation(e.target.value)}
                          placeholder="e.g., 5000"
                          className="dialog-input"
                          min="0"
                          step="any"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </fieldset>
          )}

          {/* Mortgage section - shown for PROPERTY sub-type */}
          {subAssetType === 'PROPERTY' && (
            <fieldset className="dialog-fieldset">
              <legend>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={enableMortgage}
                    onChange={(e) => setEnableMortgage(e.target.checked)}
                  />
                  Has Mortgage
                </label>
              </legend>
              {enableMortgage && (
                <div className="fieldset-content">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Original Loan Amount *</label>
                      <input
                        type="number"
                        value={mortPrincipal}
                        onChange={(e) => setMortPrincipal(e.target.value)}
                        placeholder="e.g., 200000"
                        className="dialog-input"
                        min="0"
                        step="any"
                      />
                    </div>
                    <div className="form-group">
                      <label>Current Balance *</label>
                      <input
                        type="number"
                        value={mortCurrentBalance}
                        onChange={(e) => setMortCurrentBalance(e.target.value)}
                        placeholder="e.g., 180000"
                        className="dialog-input"
                        min="0"
                        step="any"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Interest Rate (%) *</label>
                      <input
                        type="number"
                        value={mortInterestRate}
                        onChange={(e) => setMortInterestRate(e.target.value)}
                        placeholder="e.g., 3.5"
                        className="dialog-input"
                        min="0"
                        max="30"
                        step="0.01"
                      />
                    </div>
                    <div className="form-group">
                      <label>Term (years) *</label>
                      <input
                        type="number"
                        value={mortTermYears}
                        onChange={(e) => setMortTermYears(e.target.value)}
                        placeholder="e.g., 30"
                        className="dialog-input"
                        min="1"
                        step="1"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Start Date</label>
                      <input
                        type="date"
                        value={mortStartDate}
                        onChange={(e) => setMortStartDate(e.target.value)}
                        className="dialog-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Lender (optional)</label>
                      <input
                        type="text"
                        value={mortLender}
                        onChange={(e) => setMortLender(e.target.value)}
                        placeholder="e.g., ABC Bank"
                        className="dialog-input"
                      />
                    </div>
                  </div>
                  {mortPrincipal && mortInterestRate && mortTermYears && (
                    <div className="mortgage-summary">
                      <span>Monthly Payment: <strong>{calculateMonthlyPayment(parseFloat(mortPrincipal) || 0, parseFloat(mortInterestRate) || 0, parseFloat(mortTermYears) || 30).toFixed(2)}</strong></span>
                      {mortCurrentBalance && (
                        <span>Remaining: <strong>{calculateRemainingYears(parseFloat(mortCurrentBalance) || 0, calculateMonthlyPayment(parseFloat(mortPrincipal) || 0, parseFloat(mortInterestRate) || 0, parseFloat(mortTermYears) || 30), parseFloat(mortInterestRate) || 0)} yrs</strong></span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          )}

          {showTargetSettings && (
            <>
              {/* Primary residence flag for PROPERTY assets */}
              {subAssetType === 'PROPERTY' && (
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isPrimaryResidence}
                      onChange={(e) => setIsPrimaryResidence(e.target.checked)}
                    />
                    Primary Residence (excluded from FIRE calculation)
                  </label>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>Target Mode *</label>
                  <select
                    value={targetMode}
                    onChange={(e) => setTargetMode(e.target.value as AllocationMode)}
                    className="dialog-select"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    {SET_MODE_ALLOWED.includes(subAssetType) && (
                      <option value="SET">Fixed Amount</option>
                    )}
                    <option value="OFF">Off (Excluded)</option>
                  </select>
                </div>

                {targetMode === 'PERCENTAGE' && (
                  <div className="form-group">
                    <label>Target % (within asset class) *</label>
                    <input
                      type="number"
                      value={targetPercent}
                      onChange={(e) => setTargetPercent(e.target.value)}
                      placeholder="e.g., 50"
                      className="dialog-input"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {mode === 'netWorthTracker' && (
            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Any notes about this asset..."
                className="dialog-input"
                rows={2}
              />
            </div>
          )}

          <div className="dialog-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              {isEditing ? 'Update' : mode === 'assetAllocation' ? 'Add' : 'Log'} Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
