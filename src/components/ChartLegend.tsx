import { MaterialIcon } from './MaterialIcon';
import './ChartLegend.css';

export interface ChartLegendItem {
  label: string;
  color: string;
  value?: string;
  icon?: string;
}

interface ChartLegendProps {
  items: ChartLegendItem[];
  ariaLabel: string;
}

export function ChartLegend({ items, ariaLabel }: ChartLegendProps) {
  return (
    <ul className="chart-legend" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          <span className="chart-legend-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
          <span className="chart-legend-label">
            {item.icon && <MaterialIcon name={item.icon} size="small" />}
            {item.label}
          </span>
          {item.value && <span className="chart-legend-value">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}
