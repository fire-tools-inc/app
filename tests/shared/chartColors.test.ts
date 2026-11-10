import { describe, expect, it } from 'vitest';
import { ASSET_CLASS_CHART_COLORS, CHART_PALETTE, getChartColor } from '../../src/utils/chartColors';
import { prepareAssetClassChartData } from '../../src/utils/allocationCalculator';
import { computeBreakdown } from '../../src/utils/portfolioBreakdownCalculator';
import type { Asset } from '../../src/types/assetAllocation';

function luminance(hex: string): number {
  const values = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

describe('Portfolio chart palette', () => {
  it('keeps every asset-class legend readable on elevated dark panels', () => {
    const background = luminance('#263C3E');
    for (const color of Object.values(ASSET_CLASS_CHART_COLORS)) {
      expect((luminance(color) + 0.05) / (background + 0.05), color).toBeGreaterThanOrEqual(4.5);
    }
    expect(new Set(Object.values(ASSET_CLASS_CHART_COLORS)).size).toBe(9);
  });

  it('uses a green-teal primary class rather than the previous blue accent', () => {
    const color = ASSET_CLASS_CHART_COLORS.STOCKS;
    const red = parseInt(color.slice(1, 3), 16);
    const green = parseInt(color.slice(3, 5), 16);
    const blue = parseInt(color.slice(5, 7), 16);
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });
  it('uses the same class color in allocation and detailed breakdowns', () => {
    const asset: Asset = {
      id: 'test-property', name: 'Test property', ticker: '', assetClass: 'REAL_ESTATE',
      subAssetType: 'PROPERTY', currentValue: 1000, targetMode: 'PERCENTAGE', targetPercent: 100,
    };
    const allocation = prepareAssetClassChartData([{
      assetClass: 'REAL_ESTATE', assets: [asset], currentTotal: 1000, currentPercent: 100,
      targetMode: 'PERCENTAGE', targetPercent: 100, targetTotal: 1000, delta: 0, action: 'HOLD',
    }]);
    const breakdown = computeBreakdown({ assets: [asset], dimension: 'etfProvider', metadataByTicker: {} });
    expect(allocation[0].color).toBe(ASSET_CLASS_CHART_COLORS.REAL_ESTATE);
    expect(breakdown.entries[0].color).toBe(ASSET_CLASS_CHART_COLORS.REAL_ESTATE);
  });

  it('starts categorical charts with the restrained palette and supports larger sets', () => {
    expect(getChartColor(0)).toBe(CHART_PALETTE[0]);
    expect(getChartColor(12)).toMatch(/^hsl\(.+, 35%, 72%\)$/);
    expect(getChartColor(12)).toBe(getChartColor(12));
  });
});
