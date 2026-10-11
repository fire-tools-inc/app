import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllocationChart } from '../../../src/components/AllocationChart';
import { ASSET_CLASS_CHART_COLORS } from '../../../src/utils/chartColors';

const mocks = vi.hoisted(() => ({ pie: vi.fn() }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, height }: { children: ReactNode; height: number }) => <div data-testid="chart-size" data-height={height}>{children}</div>,
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pie: (props: { children: ReactNode }) => {
    mocks.pie(props);
    return <div>{props.children}</div>;
  },
  Cell: () => null,
  Tooltip: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Allocation chart presentation', () => {
  it('uses a compact donut and a readable full-name legend instead of floating labels', () => {
    const data = [
      { name: 'STOCKS', value: 600, percentage: 60, color: ASSET_CLASS_CHART_COLORS.STOCKS },
      { name: 'BONDS', value: 300, percentage: 30, color: ASSET_CLASS_CHART_COLORS.BONDS },
      { name: 'CASH', value: 100, percentage: 10, color: ASSET_CLASS_CHART_COLORS.CASH },
    ];
    render(<AllocationChart data={data} title="Test allocation" currency="EUR" />);
    const legend = screen.getByRole('list', { name: 'Test allocation' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(3);
    expect(within(legend).getByText('60.00%')).toBeTruthy();
    expect(screen.getByTestId('chart-size').getAttribute('data-height')).toBe('240');
    expect(mocks.pie).toHaveBeenCalledWith(expect.objectContaining({
      outerRadius: 90, innerRadius: 62, isAnimationActive: false,
    }));
    expect(mocks.pie.mock.lastCall?.[0].label).toBeUndefined();
  });

  it('keeps long holding names available without truncation', () => {
    const name = 'A long synthetic holding name for the allocation legend';
    render(<AllocationChart data={[{ name, value: 100, percentage: 100 }]} title="Holdings" currency="EUR" />);
    expect(within(screen.getByRole('list', { name: 'Holdings' })).getByText(name)).toBeTruthy();
  });

  it('preserves the existing empty-state message', () => {
    render(<AllocationChart data={[]} title="Empty allocation" currency="EUR" />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(document.querySelector('.empty-chart')).not.toBeNull();
  });
});
