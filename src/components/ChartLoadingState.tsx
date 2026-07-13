import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';

export function ChartLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="chart-loading-placeholder" role="status" aria-live="polite">
      <MaterialIcon name="progress_activity" size="large" />
      <span>{t('common.loading')}</span>
    </div>
  );
}

export function ChartLoadFailure() {
  const { t } = useTranslation();
  return (
    <div className="chart-load-error" role="alert">
      <MaterialIcon name="error" />
      <span>{t('app.routeLoadErrorTitle')}</span>
      <button type="button" className="secondary-btn" onClick={() => window.location.reload()}>
        {t('app.reload')}
      </button>
    </div>
  );
}
