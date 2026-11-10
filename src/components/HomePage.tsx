import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeferredRender } from '../hooks/useDeferredRender';
import { saveSettings } from '../utils/cookieSettings';
import { formatDashboardMonth, loadDashboardData } from '../utils/dashboard';
import { createLazyComponent } from '../utils/lazyComponent';
import { logger } from '../utils/logger';
import { formatDisplayCurrency, formatDisplayPercent } from '../utils/numberFormatter';
import { ChartLoadingFallback, ChartLoadFailure } from './ChartLoadingState';
import { MaterialIcon } from './MaterialIcon';
import { PreloadLink } from './PreloadLink';
import { PrivacyBlur } from './PrivacyBlur';
import './HomePage.css';

const DashboardChart = createLazyComponent(
  'dashboard-chart',
  () => import('./DashboardChart').then(module => module.DashboardChart),
  () => <ChartLoadFailure />,
);

function EmptyPanel({ icon, message, to, action }: { icon: string; message: string; to: string; action: string }) {
  return (
    <div className="dashboard-empty">
      <MaterialIcon name={icon} size="large" />
      <p>{message}</p>
      <PreloadLink to={to} className="dashboard-link">{action}<MaterialIcon name="arrow_forward" size="small" /></PreloadLink>
    </div>
  );
}

function PanelHeader({ id, title, to, action, children }: {
  id: string; title: string; to: string; action: string; children?: ReactNode;
}) {
  return (
    <header className="dashboard-panel-header">
      <div><h2 id={id}>{title}</h2>{children}</div>
      <PreloadLink to={to} className="dashboard-link">{action}<MaterialIcon name="arrow_outward" size="small" /></PreloadLink>
    </header>
  );
}

export function HomePage() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(loadDashboardData);
  const [historyRange, setHistoryRange] = useState('recent');
  const [privacyError, setPrivacyError] = useState(false);
  const renderCharts = useDeferredRender();
  const privacy = data.settings.privacyMode;
  const currency = data.settings.currencySettings.defaultCurrency;
  const monthLabel = (period: string) => formatDashboardMonth(period, i18n.resolvedLanguage ?? 'en');
  const value = (amount: number | null | undefined, sourceCurrency = currency) => amount == null ? '—' : (
    <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(amount, sourceCurrency)}</PrivacyBlur>
  );
  const percent = (amount: number) => <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayPercent(amount)}</PrivacyBlur>;
  const cashflowPath = `/expense-tracker?year=${data.currentPeriod.slice(0, 4)}&month=${Number(data.currentPeriod.slice(5))}`;
  const toolsUrl = __APP_PAGES_URL__ ? new URL('../#features', __APP_PAGES_URL__).href : `${__APP_REPO_URL__}#readme`;
  const netWorthHistory = historyRange === 'recent' ? data.netWorth.history.slice(-12) : data.netWorth.history;
  const fire = data.fire;

  useEffect(() => {
    const refresh = () => setData(loadDashboardData());
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const togglePrivacy = () => {
    const settings = { ...data.settings, privacyMode: !privacy };
    try {
      saveSettings(settings);
      setData(previous => ({ ...previous, settings }));
      setPrivacyError(false);
    } catch (error) {
      logger.error('dashboard', 'privacy-save-failed', 'failed to save dashboard privacy preference', {
        pii: { error: error instanceof Error ? error.message : String(error) },
      });
      setPrivacyError(true);
    }
  };

  return (
    <main className="homepage" id="main-content" tabIndex={-1}>
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">{t('app.tagline')}</p>
          <h1>{t('dashboard.title')}</h1>
          <p className="dashboard-description">{t('dashboard.description')}</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="dashboard-privacy" onClick={togglePrivacy} aria-pressed={privacy}>
            <MaterialIcon name={privacy ? 'visibility' : 'visibility_off'} size="small" />
            {t(privacy ? 'common.showValues' : 'common.hideValues')}
          </button>
          <span className="dashboard-local-status"><MaterialIcon name="lock" size="small" />{t('home.localFirst')}</span>
        </div>
      </header>
      {privacyError && <p className="dashboard-error" role="alert">{t('dashboard.privacySaveFailed')}</p>}

      <dl className="dashboard-metrics" aria-label={t('dashboard.totals')}>
        <div className="dashboard-metric dashboard-metric--net-worth">
          <dt>{t('dashboard.netWorth')}</dt>
          <dd>{value(data.netWorth.latest?.netWorth, data.netWorth.currency)}</dd>
          <span>{data.netWorth.latest ? t('dashboard.asOf', { month: monthLabel(data.netWorth.latest.period) }) : t('dashboard.noSnapshot')}</span>
        </div>
        <div className="dashboard-metric dashboard-metric--portfolio">
          <dt>{t('dashboard.portfolio')}</dt>
          <dd>{value(data.allocation.total)}</dd>
          <span>{t('dashboard.activeHoldings')}</span>
        </div>
        <div className={`dashboard-metric${(data.cashflow.current?.netBalance ?? 0) < 0 ? ' dashboard-metric--negative' : ''}`}>
          <dt>{t('dashboard.monthlyBalance')}</dt>
          <dd>{value(data.cashflow.current?.netBalance, data.cashflow.currency)}</dd>
          <span>{monthLabel(data.currentPeriod)}</span>
        </div>
        <div className="dashboard-metric dashboard-metric--fire">
          <dt>{t('dashboard.fireProgress')}</dt>
          <dd>{fire ? percent(fire.progress) : '—'}</dd>
          <span>{fire ? t(`fireCalculator.fireTypes.${fire.fireType}.label`) : t('dashboard.noPlan')}</span>
        </div>
      </dl>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="dashboard-net-worth-title">
          <PanelHeader id="dashboard-net-worth-title" title={t('dashboard.netWorthHistory')} to="/net-worth-tracker" action={t('dashboard.openTracker')}>
            <p>{t('dashboard.savedSnapshots')}</p>
          </PanelHeader>
          {data.netWorth.latest ? (
            <>
              <div className="dashboard-history-controls">
                <p>{t('dashboard.previousSnapshotChange')} <strong>{value(data.netWorth.change, data.netWorth.currency)}</strong></p>
                <select aria-label={t('dashboard.historyRange')} value={historyRange} onChange={event => setHistoryRange(event.target.value)}>
                  <option value="recent">{t('dashboard.recentHistory')}</option>
                  <option value="all">{t('dashboard.allHistory')}</option>
                </select>
              </div>
              {renderCharts ? <Suspense fallback={<ChartLoadingFallback />}>
                <DashboardChart kind="net-worth" data={netWorthHistory} currency={data.netWorth.currency} isPrivacyMode={privacy} />
              </Suspense> : <ChartLoadingFallback />}
            </>
          ) : <EmptyPanel icon="show_chart" message={t('dashboard.emptyNetWorth')} to="/net-worth-tracker" action={t('dashboard.trackNetWorth')} />}
        </section>

        <section className="dashboard-panel dashboard-fire" aria-labelledby="dashboard-fire-title">
          <PanelHeader id="dashboard-fire-title" title={t('dashboard.fireProgress')} to="/fire-calculator" action={t('dashboard.editPlan')} />
          {fire ? (
            <>
              <p className="dashboard-fire-variant">{t(`fireCalculator.fireTypes.${fire.fireType}.label`)}</p>
              <p className="dashboard-fire-percent">{percent(fire.progress)}<span>{t('dashboard.ofTarget')}</span></p>
              <div className="dashboard-goal-track" role="progressbar" aria-label={t('dashboard.progressLabel')}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={privacy ? undefined : Math.min(100, Math.max(0, fire.progress))}
                aria-valuetext={privacy ? t('privacyBlur.ariaLabel') : formatDisplayPercent(fire.progress)}>
                <span style={{ width: `${Math.min(100, Math.max(0, fire.progress))}%` }} />
              </div>
              <dl className="dashboard-fire-values">
                <div><dt>{t('dashboard.firePortfolio')}</dt><dd>{value(fire.portfolioValue)}</dd></div>
                <div><dt>{t('dashboard.fireTarget')}</dt><dd>{value(fire.target)}</dd></div>
                <div><dt>{t('dashboard.remaining')}</dt><dd>{value(fire.remaining)}</dd></div>
              </dl>
              <p className="dashboard-fire-timeline">
                <MaterialIcon name="flag" size="small" />
                {fire.yearsToFIRE === 0 ? t('dashboard.targetReached') : fire.yearsToFIRE < 0
                  ? t('dashboard.targetNotReached') : t('dashboard.projectedYears', { count: fire.yearsToFIRE })}
              </p>
              <p className="dashboard-caption">{t(fire.usesAllocation ? 'dashboard.allocationBasis' : 'dashboard.calculatorBasis')}</p>
            </>
          ) : <EmptyPanel icon="local_fire_department" message={t(data.firePlanInvalid ? 'dashboard.invalidPlan' : 'dashboard.emptyFire')}
            to="/fire-calculator" action={t(data.firePlanInvalid ? 'dashboard.editPlan' : 'dashboard.setUpPlan')} />}
        </section>

        <section className="dashboard-panel" aria-labelledby="dashboard-cashflow-title">
          <PanelHeader id="dashboard-cashflow-title" title={t('dashboard.monthlyCashflow')} to={cashflowPath} action={t('dashboard.openCashflow')}>
            <p>{monthLabel(data.currentPeriod)}</p>
          </PanelHeader>
          {data.cashflow.current ? (
            <dl className="dashboard-cashflow-totals">
              <div><dt>{t('charts.income')}</dt><dd>{value(data.cashflow.current.totalIncome, data.cashflow.currency)}</dd></div>
              <div><dt>{t('charts.expenses')}</dt><dd>{value(data.cashflow.current.totalExpenses, data.cashflow.currency)}</dd></div>
              <div><dt>{t('dashboard.savingsRate')}</dt><dd>{percent(data.cashflow.current.savingsRate)}</dd></div>
            </dl>
          ) : <p className="dashboard-caption">{t('dashboard.noCurrentCashflow')}</p>}
          {data.cashflow.history.length ? (
            <>
              {renderCharts ? <Suspense fallback={<ChartLoadingFallback />}>
                <DashboardChart kind="cashflow" data={data.cashflow.history} currency={data.cashflow.currency} isPrivacyMode={privacy} />
              </Suspense> : <ChartLoadingFallback />}
              <p className="dashboard-caption">{t('dashboard.trackedMonths')}</p>
            </>
          ) : <EmptyPanel icon="account_balance_wallet" message={t('dashboard.emptyCashflow')} to={cashflowPath} action={t('dashboard.addTransactions')} />}
        </section>

        <section className="dashboard-panel dashboard-allocation" aria-labelledby="dashboard-allocation-title">
          <PanelHeader id="dashboard-allocation-title" title={t('dashboard.assetAllocation')} to="/asset-allocation" action={t('dashboard.manageAssets')}>
            <p>{t('dashboard.activeHoldings')}</p>
          </PanelHeader>
          {data.allocation.chartData.length ? (
            renderCharts ? <Suspense fallback={<ChartLoadingFallback />}>
              <DashboardChart kind="allocation" data={data.allocation.chartData} currency={currency} isPrivacyMode={privacy} />
            </Suspense> : <ChartLoadingFallback />
          ) : <EmptyPanel icon="pie_chart" message={t('dashboard.emptyAllocation')} to="/asset-allocation" action={t('dashboard.addAssets')} />}
          {data.allocation.hasNegativeBalances && <p className="dashboard-caption">{t('dashboard.negativeBalances')}</p>}
        </section>
        <section className="dashboard-panel" aria-labelledby="dashboard-upcoming-title">
          <PanelHeader id="dashboard-upcoming-title" title={t('planning.homeUpcoming')} to="/expense-tracker?tab=planning" action={t('planning.openPlanning')} />
          {data.planning.invalid ? <p className="dashboard-error" role="alert">{t('planning.invalidSaved')}</p>
            : data.planning.upcoming.length ? <ul className="dashboard-planning-list">
              {data.planning.upcoming.map(item => <li key={`${item.scheduleId}:${item.scheduledDate}`}>
                <div><strong>{item.schedule.name}</strong><span>{item.scheduledDate}</span></div>
                <span>{value(item.schedule.amount, item.schedule.currency)} {item.schedule.currency}</span>
              </li>)}
            </ul> : <p className="dashboard-caption">{t('planning.homeEmpty')}</p>}
        </section>
        <section className="dashboard-panel" aria-labelledby="dashboard-goals-title">
          <PanelHeader id="dashboard-goals-title" title={t('planning.goals')} to="/expense-tracker?tab=planning" action={t('planning.openGoals')} />
          {data.planning.goals.length ? <ul className="dashboard-planning-list">
            {data.planning.goals.map(goal => <li key={goal.id}>
              <strong>{goal.name}</strong><span>{value(goal.savedAmount, goal.currency)} / {value(goal.targetAmount, goal.currency)} {goal.currency}</span>
            </li>)}
          </ul> : <p className="dashboard-caption">{t('planning.noGoals')}</p>}
          <p className="dashboard-caption">{t('planning.goalHelp')}</p>
        </section>
      </div>

      <footer className="dashboard-footer">
        <p>{t('home.disclaimerBody')}</p>
        <a href={toolsUrl} target="_blank" rel="noopener noreferrer" className="dashboard-link">
          {t('dashboard.browseTools')}<MaterialIcon name="arrow_outward" size="small" />
        </a>
      </footer>
    </main>
  );
}
