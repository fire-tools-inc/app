import type { AssetClass } from '../types/assetAllocation';

export const ASSET_CLASS_CHART_COLORS: Readonly<Record<AssetClass, string>> = {
  STOCKS: '#8CBCF3',
  BONDS: '#A8B9D1',
  CASH: '#8BD0AF',
  CRYPTO: '#EDB58A',
  REAL_ESTATE: '#C5AF96',
  COMMODITIES: '#D4C392',
  VEHICLE: '#92A2B8',
  COLLECTIBLE: '#CFA7AD',
  ART: '#91C8CC',
};

export const CHART_PALETTE: readonly string[] = Object.values(ASSET_CLASS_CHART_COLORS);

export function getChartColor(index: number): string {
  return CHART_PALETTE[index] ?? `hsl(${(index * 137.5) % 360}, 35%, 72%)`;
}
