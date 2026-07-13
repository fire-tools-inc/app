import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from '../components/MaterialIcon';
import { logger } from '../utils/logger';

interface LazyPage<Props extends object> {
  Component: LazyExoticComponent<ComponentType<Props>>;
  preload: () => Promise<void>;
}

function RouteLoadError() {
  const { t } = useTranslation();

  return (
    <main className="route-load-error" id="main-content" role="alert">
      <MaterialIcon name="error" size="large" />
      <h2>{t('app.routeLoadErrorTitle')}</h2>
      <p>{t('app.routeLoadErrorBody')}</p>
      <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
        <MaterialIcon name="refresh" size="small" />
        {t('app.reload')}
      </button>
    </main>
  );
}

function createLazyPage<Props extends object>(
  routePath: string,
  loadComponent: () => Promise<ComponentType<Props>>,
): LazyPage<Props> {
  let componentPromise: Promise<ComponentType<Props>> | undefined;
  let errorReported = false;

  const load = () => {
    componentPromise ??= loadComponent();
    return componentPromise;
  };

  const reportError = (error: unknown) => {
    if (errorReported) return;
    errorReported = true;
    logger.error('routing', 'chunk-load-failed', `failed to load route module: ${routePath}`, {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
  };

  const Component = lazy(async () => {
    try {
      return { default: await load() };
    } catch (error) {
      reportError(error);
      const FailedRoute = (_props: Props) => <RouteLoadError />;
      return { default: FailedRoute };
    }
  });

  const preload = async () => {
    try {
      await load();
    } catch (error) {
      reportError(error);
    }
  };

  return { Component, preload };
}

const fireCalculatorRoute = createLazyPage(
  '/fire-calculator',
  () => import('../components/FIRECalculatorPage').then((module) => module.FIRECalculatorPage),
);
const reverseFireCalculatorRoute = createLazyPage(
  '/reverse-fire-calculator',
  () => import('../components/ReverseFIRECalculatorPage').then((module) => module.ReverseFIRECalculatorPage),
);
const monteCarloRoute = createLazyPage(
  '/monte-carlo',
  () => import('../components/MonteCarloPage').then((module) => module.MonteCarloPage),
);
const investmentGrowthRoute = createLazyPage(
  '/investment-growth',
  () => import('../components/InvestmentGrowthPage').then((module) => module.InvestmentGrowthPage),
);
const withdrawalRateRoute = createLazyPage(
  '/withdrawal-rate',
  () => import('../components/WithdrawalRatePage').then((module) => module.WithdrawalRatePage),
);
const assetAllocationRoute = createLazyPage(
  '/asset-allocation',
  () => import('../components/AssetAllocationPage').then((module) => module.AssetAllocationPage),
);
const portfolioBacktestRoute = createLazyPage(
  '/portfolio-backtest',
  () => import('../components/PortfolioBacktestPage').then((module) => module.PortfolioBacktestPage),
);
const portfolioBreakdownRoute = createLazyPage(
  '/portfolio-breakdown',
  () => import('../components/PortfolioBreakdownPage').then((module) => module.PortfolioBreakdownPage),
);
const expenseTrackerRoute = createLazyPage(
  '/expense-tracker',
  () => import('../components/ExpenseTrackerPage').then((module) => module.ExpenseTrackerPage),
);
const netWorthTrackerRoute = createLazyPage(
  '/net-worth-tracker',
  () => import('../components/NetWorthTrackerPage').then((module) => module.NetWorthTrackerPage),
);
const debtPayoffRoute = createLazyPage(
  '/debt-payoff',
  () => import('../components/DebtPayoffPage').then((module) => module.DebtPayoffPage),
);
const questionnaireRoute = createLazyPage(
  '/questionnaire',
  () => import('../components/QuestionnairePage').then((module) => module.QuestionnairePage),
);
const settingsRoute = createLazyPage(
  '/settings',
  () => import('../components/SettingsPage').then((module) => module.SettingsPage),
);

export const LazyFIRECalculatorPage = fireCalculatorRoute.Component;
export const LazyReverseFIRECalculatorPage = reverseFireCalculatorRoute.Component;
export const LazyMonteCarloPage = monteCarloRoute.Component;
export const LazyInvestmentGrowthPage = investmentGrowthRoute.Component;
export const LazyWithdrawalRatePage = withdrawalRateRoute.Component;
export const LazyAssetAllocationPage = assetAllocationRoute.Component;
export const LazyPortfolioBacktestPage = portfolioBacktestRoute.Component;
export const LazyPortfolioBreakdownPage = portfolioBreakdownRoute.Component;
export const LazyExpenseTrackerPage = expenseTrackerRoute.Component;
export const LazyNetWorthTrackerPage = netWorthTrackerRoute.Component;
export const LazyDebtPayoffPage = debtPayoffRoute.Component;
export const LazyQuestionnairePage = questionnaireRoute.Component;
export const LazySettingsPage = settingsRoute.Component;

const routePreloaders: Record<string, () => Promise<void>> = {
  '/fire-calculator': fireCalculatorRoute.preload,
  '/reverse-fire-calculator': reverseFireCalculatorRoute.preload,
  '/monte-carlo': monteCarloRoute.preload,
  '/investment-growth': investmentGrowthRoute.preload,
  '/withdrawal-rate': withdrawalRateRoute.preload,
  '/asset-allocation': assetAllocationRoute.preload,
  '/portfolio-backtest': portfolioBacktestRoute.preload,
  '/portfolio-breakdown': portfolioBreakdownRoute.preload,
  '/expense-tracker': expenseTrackerRoute.preload,
  '/net-worth-tracker': netWorthTrackerRoute.preload,
  '/debt-payoff': debtPayoffRoute.preload,
  '/questionnaire': questionnaireRoute.preload,
  '/settings': settingsRoute.preload,
};

export function preloadRoute(path: string): Promise<void> | undefined {
  const [pathname] = path.split(/[?#]/);
  return routePreloaders[pathname]?.();
}
