import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IncomeExpensesChart } from '../../../src/components/IncomeExpensesChart';

const mocks = vi.hoisted(() => ({ bar: vi.fn(), chart: vi.fn() }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: (props: { children: ReactNode }) => { mocks.chart(props); return <div>{props.children}</div>; },
  Bar: (props: { stackId: string; dataKey: string }) => { mocks.bar(props); return null; },
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Income versus expenses plot', () => {
  it('compares one income stack with expenses rather than six oversized adjacent bars', () => {
    render(<IncomeExpensesChart
      projections={[]}
      currentAge={30}
      zoomYears="all"
      onZoomChange={() => {}}
      customZoomInput=""
      onCustomZoomInputChange={() => {}}
    />);
    const bars = mocks.bar.mock.calls.map(([props]) => props);
    expect(bars.filter(bar => bar.stackId === 'income')).toHaveLength(5);
    expect(bars.find(bar => bar.dataKey === 'Expenses')?.stackId).toBe('expenses');
    expect(mocks.chart.mock.lastCall?.[0].barSize).toBeUndefined();
    expect(mocks.chart.mock.lastCall?.[0].maxBarSize).toBe(40);
    expect(mocks.chart.mock.lastCall?.[0].stackOffset).toBe('sign');
    expect(document.querySelectorAll('.chart-legend li')).toHaveLength(6);
  });
});
