/**
 * Number Formatter Utility
 * Provides consistent number formatting across the application
 * Respects user settings for decimal places and decimal separator
 */

import { loadSettings, type UserSettings } from './cookieSettings';
import { getCurrencySymbol } from './currencyConverter';
import type { SupportedCurrency } from '../types/currency';

/**
 * Format a number for display according to user settings
 * - Numbers below 1000 show decimal places as per settings
 * - Numbers >= 1000 show no decimal places
 * - Uses standard rounding (.5 rounds up, .4 rounds down)
 * 
 * @param value - The numeric value to format
 * @returns The formatted string
 */
export function formatDisplayNumber(value: number): string {
  return formatNumber(value, loadSettings());
}

function formatNumber(value: number, settings: Pick<UserSettings, 'decimalSeparator' | 'decimalPlaces'>): string {
  const decimalSeparator = settings.decimalSeparator;
  const decimalPlaces = settings.decimalPlaces ?? 2;
  
  const absValue = Math.abs(value);
  const isNegative = value < 0;
  
  // Determine if we should show decimals (only for values < 1000)
  // We need to check the rounded value to handle edge cases like 999.995
  const roundedValue = Math.round(absValue * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
  const showDecimals = roundedValue < 1000;
  
  let formatted: string;
  
  if (showDecimals) {
    // Format with decimal places
    formatted = roundedValue.toFixed(decimalPlaces);
  } else {
    // Format without decimals (round to nearest integer)
    formatted = Math.round(absValue).toString();
  }
  
  // Add thousands separators
  const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
  
  // Split by decimal point to handle integer and decimal parts separately
  const parts = formatted.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];
  
  // Add thousands separators to integer part
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  
  // Reassemble with proper decimal separator
  let result = formattedInteger;
  if (decimalPart !== undefined) {
    result += decimalSeparator + decimalPart;
  }
  
  // Add negative sign if needed
  if (isNegative) {
    result = '-' + result;
  }
  
  return result;
}

/**
 * Format a percentage value for display
 * Always shows decimal places as per settings (percentages are typically < 1000)
 * 
 * @param value - The percentage value (e.g., 45.5 for 45.5%)
 * @param showSign - Optional. If true, shows + for positive values and - for negative values
 * @returns The formatted percentage string with % symbol
 */
export function formatDisplayPercent(value: number, showSign: boolean = false): string {
  const settings = loadSettings();
  const decimalSeparator = settings.decimalSeparator;
  const decimalPlaces = settings.decimalPlaces ?? 2;
  
  // Round to specified decimal places
  const absValue = Math.abs(value);
  const roundedValue = Math.round(absValue * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
  
  // Format with decimal places
  let formatted = roundedValue.toFixed(decimalPlaces);
  
  // Replace decimal separator if needed
  if (decimalSeparator === ',') {
    formatted = formatted.replace('.', ',');
  }
  
  // Add sign if requested
  if (showSign) {
    const sign = value >= 0 ? '+' : '-';
    return sign + formatted + '%';
  }
  
  // Standard formatting with negative sign if needed
  if (value < 0) {
    return '-' + formatted + '%';
  }
  
  return formatted + '%';
}

/**
 * Format a currency value for display
 * Combines formatDisplayNumber with currency symbol
 * 
 * @param value - The numeric value to format
 * @param currency - Optional currency code. If not provided, uses default from settings
 * @returns The formatted currency string with symbol
 */
export function formatDisplayCurrency(value: number, currency?: string): string {
  const settings = loadSettings();
  const currencyCode = (currency ?? settings.currencySettings.defaultCurrency) as SupportedCurrency;
  const symbol = getCurrencySymbol(currencyCode);
  return symbol + formatNumber(value, settings);
}
