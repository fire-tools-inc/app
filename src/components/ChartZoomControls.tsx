import { useTranslation } from 'react-i18next';

interface ChartZoomControlsProps {
  zoomYears: number | 'all';
  onZoomChange: (years: number | 'all') => void;
  customZoomInput: string;
  onCustomZoomInputChange: (value: string) => void;
}

const PRESETS = [20, 30, 40, 'all'] as const;

export function ChartZoomControls({ zoomYears, onZoomChange, customZoomInput, onCustomZoomInputChange }: ChartZoomControlsProps) {
  const { t } = useTranslation();
  const applyCustomZoom = () => {
    const years = Number(customZoomInput);
    if (Number.isInteger(years) && years > 0) onZoomChange(years);
  };

  return (
    <div className="chart-zoom-controls" role="group" aria-label={t('charts.zoomControls')}>
      {PRESETS.map(years => (
        <button
          type="button"
          key={years}
          className={`zoom-button${zoomYears === years ? ' active' : ''}`}
          onClick={() => onZoomChange(years)}
          aria-pressed={zoomYears === years}
          aria-label={years === 'all' ? t('charts.showAllYearsAriaLabel') : t(`charts.zoomTo${years}AriaLabel`)}
        >
          {years === 'all' ? t('charts.zoomAllYears') : t(`charts.zoom${years}Years`)}
        </button>
      ))}
      <input
        type="number"
        inputMode="numeric"
        min="1"
        step="1"
        value={customZoomInput}
        onChange={event => onCustomZoomInputChange(event.target.value)}
        onBlur={applyCustomZoom}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            if (event.currentTarget.checkValidity()) applyCustomZoom();
            else event.currentTarget.reportValidity();
          }
        }}
        placeholder={t('charts.customZoomPlaceholder')}
        aria-label={t('charts.customZoomAriaLabel')}
      />
    </div>
  );
}
