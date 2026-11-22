import type { AssetClass } from '../types/assetAllocation';

export const ASSET_CLASS_CHART_COLORS: Readonly<Record<AssetClass, string>> = {
  STOCKS: '#65D4C4',
  BONDS: '#B5C9C5',
  CASH: '#9BD7B0',
  CRYPTO: '#EDB58A',
  REAL_ESTATE: '#C5AF96',
  COMMODITIES: '#D4C392',
  VEHICLE: '#99ACA9',
  COLLECTIBLE: '#CFA7AD',
  ART: '#91C8CC',
};

export const CHART_PALETTE: readonly string[] = Object.values(ASSET_CLASS_CHART_COLORS);

export function getChartColor(index: number): string {
  return CHART_PALETTE[index] ?? `hsl(${(index * 137.5) % 360}, 35%, 72%)`;
}

/** Neutral chart chrome shared by Recharts axes, grids and tooltips (mirrors App.css tokens). */
export const CHART_THEME = {
  background: '#0D1213',
  text: '#A9B7B4',
  textStrong: '#E8EEEC',
  axis: '#354344',
  grid: '#273233',
  tooltipBackground: '#1B2425',
  tooltipBorder: '#354344',
  success: '#7FCBA4',
  warning: '#E8B07F',
  error: '#F09AA3',
} as const;
