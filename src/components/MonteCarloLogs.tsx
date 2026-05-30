import { useState, useMemo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { SimulationLogEntry, MonteCarloFixedParameters, SimulationFailureReason } from '../types/calculator';
import { MaterialIcon } from './MaterialIcon';
import { exportMonteCarloLogsToCSV, exportMonteCarloLogsToJSON } from '../utils/csvExport';
import { loadSettings } from '../utils/cookieSettings';
import { formatDisplayCurrency, formatDisplayPercent } from '../utils/numberFormatter';
import { PrivacyBlur } from './PrivacyBlur';

interface MonteCarloLogsProps {
  logs: SimulationLogEntry[];
  fixedParameters: MonteCarloFixedParameters;
  isPrivacyMode?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const FAILURE_REASON_KEY: Record<SimulationFailureReason, string> = {
  'portfolio_depleted': 'monteCarlo.logs.failureReasons.portfolioDepleted',
  'sequence_of_returns_risk': 'monteCarlo.logs.failureReasons.sequenceOfReturnsRisk',
  'unsustainable_ending': 'monteCarlo.logs.failureReasons.unsustainableEnding',
  'fire_too_late': 'monteCarlo.logs.failureReasons.fireTooLate',
  'withdrawal_rate_breach': 'monteCarlo.logs.failureReasons.withdrawalRateBreach',
  'fire_lost': 'monteCarlo.logs.failureReasons.fireLost',
  'forced_return_to_work': 'monteCarlo.logs.failureReasons.forcedReturnToWork',
  'healthcare_expense_shock': 'monteCarlo.logs.failureReasons.healthcareExpenseShock',
};

// Format number with 2 decimal places
const formatDecimal = (value: number): string => value.toFixed(2);

export const MonteCarloLogs: React.FC<MonteCarloLogsProps> = ({ 
  logs, 
  fixedParameters,
  isPrivacyMode = false 
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSimulations, setExpandedSimulations] = useState<Set<number>>(new Set());
  const [filterSuccess, setFilterSuccess] = useState<'all' | 'success' | 'failure'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Load default currency from settings
  const defaultCurrency = useMemo(() => {
    const settings = loadSettings();
    return settings.currencySettings.defaultCurrency;
  }, []);

  // Filter logs based on success/failure filter
  const filteredLogs = useMemo(() => {
    if (filterSuccess === 'all') return logs;
    if (filterSuccess === 'success') return logs.filter(l => l.success);
    return logs.filter(l => !l.success);
  }, [logs, filterSuccess]);

  // Calculate total pages
  const totalPages = Math.ceil(filteredLogs.length / pageSize);

  // Get current page of logs
  const displayedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredLogs.slice(startIndex, startIndex + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Reset to page 1 when filter changes
  const handleFilterChange = (newFilter: 'all' | 'success' | 'failure') => {
    setFilterSuccess(newFilter);
    setCurrentPage(1);
  };

  // Reset to page 1 when page size changes
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // Toggle simulation expansion (inline)
  const toggleSimulation = (simulationId: number) => {
    setExpandedSimulations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(simulationId)) {
        newSet.delete(simulationId);
      } else {
        newSet.add(simulationId);
      }
      return newSet;
    });
  };

  const handleDownloadCSV = () => {
    const csv = exportMonteCarloLogsToCSV(logs, fixedParameters);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monte-carlo-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    const json = exportMonteCarloLogsToJSON(logs, fixedParameters);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monte-carlo-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (logs.length === 0) {
    return null;
  }

  return (
    <section className="mc-logs-section" aria-labelledby="mc-logs-heading" data-tour="monte-carlo-logs">
      <button
        type="button"
        className="mc-logs-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="mc-logs-content"
      >
        <span className="mc-logs-title">
          <MaterialIcon name="list_alt" /> {t('monteCarlo.logs.title')}
        </span>
        <span className="mc-logs-subtitle">
          {t('monteCarlo.logs.recordedCount', { count: logs.length })}
        </span>
        <span className="collapse-icon" aria-hidden="true">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div id="mc-logs-content" className="mc-logs-content">
          <div className="mc-logs-header">
            <p className="mc-logs-description">
              <MaterialIcon name="info" /> {t('monteCarlo.logs.description')}
            </p>
            
            <div className="mc-logs-actions">
              <button
                type="button"
                className="mc-logs-download-btn"
                onClick={handleDownloadCSV}
                aria-label={t('monteCarlo.logs.downloadCSVAria')}
              >
                <MaterialIcon name="download" /> CSV
              </button>
              <button
                type="button"
                className="mc-logs-download-btn"
                onClick={handleDownloadJSON}
                aria-label={t('monteCarlo.logs.downloadJSONAria')}
              >
                <MaterialIcon name="download" /> JSON
              </button>
            </div>
          </div>

          <div className="mc-logs-controls">
            <div className="mc-logs-filter">
              <label htmlFor="log-filter">{t('monteCarlo.logs.filterLabel')}</label>
              <select
                id="log-filter"
                value={filterSuccess}
                onChange={(e) => handleFilterChange(e.target.value as 'all' | 'success' | 'failure')}
              >
                <option value="all">{t('monteCarlo.logs.filterAll', { count: logs.length })}</option>
                <option value="success">{t('monteCarlo.logs.filterSuccess', { count: logs.filter(l => l.success).length })}</option>
                <option value="failure">{t('monteCarlo.logs.filterFailed', { count: logs.filter(l => !l.success).length })}</option>
              </select>
            </div>

            <div className="mc-logs-page-size">
              <label htmlFor="page-size">{t('monteCarlo.logs.showLabel')}</label>
              <select
                id="page-size"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{t('monteCarlo.logs.perPage', { count: size })}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mc-logs-table-container">
            <table className="mc-logs-table" role="grid">
              <thead>
                <tr>
                  <th scope="col">{t('monteCarlo.logs.colId')}</th>
                  <th scope="col">{t('monteCarlo.logs.colStatus')}</th>
                  <th scope="col">{t('monteCarlo.logs.colYearsToFIRE')}</th>
                  <th scope="col">{t('monteCarlo.logs.colFinalPortfolio')}</th>
                  <th scope="col">{t('monteCarlo.logs.colDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {displayedLogs.map((log) => (
                  <Fragment key={log.simulationId}>
                    <tr 
                      className={expandedSimulations.has(log.simulationId) ? 'expanded' : ''}
                    >
                      <td>#{log.simulationId}</td>
                      <td>
                        <span className={`status-badge ${log.success ? 'success' : 'failure'}`}>
                          {log.success ? t('monteCarlo.logs.statusSuccess') : t('monteCarlo.logs.statusFailed')}
                        </span>
                        {log.failureReasons && log.failureReasons.length > 0 && (
                          <div className="failure-reasons">
                            {log.failureReasons.map(reason => (
                              <span key={reason} className="failure-reason-badge" title={t(FAILURE_REASON_KEY[reason])}>
                                {t(FAILURE_REASON_KEY[reason])}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>{log.yearsToFIRE !== null ? t('monteCarlo.logs.yearsValue', { count: log.yearsToFIRE }) : t('common.notAvailable')}</td>
                      <td>
                        <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                          {formatDisplayCurrency(log.finalPortfolio, defaultCurrency)}
                        </PrivacyBlur>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="mc-logs-view-btn"
                          onClick={() => toggleSimulation(log.simulationId)}
                          aria-label={t('monteCarlo.logs.viewDetailsAria', { id: log.simulationId })}
                          aria-expanded={expandedSimulations.has(log.simulationId)}
                        >
                          <MaterialIcon name={expandedSimulations.has(log.simulationId) ? 'expand_less' : 'expand_more'} />
                        </button>
                      </td>
                    </tr>
                    {expandedSimulations.has(log.simulationId) && (
                      <tr className="mc-logs-inline-detail">
                        <td colSpan={5}>
                          <div className="mc-logs-detail-inline">
                            {/* Initial parameters summary */}
                            <div className="mc-logs-initial-params">
                              <h5>{t('monteCarlo.logs.initialParams')}</h5>
                              <div className="mc-logs-params-grid">
                                <span>{t('monteCarlo.logs.paramInitialSavings')}: <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayCurrency(fixedParameters.initialSavings, defaultCurrency)}</PrivacyBlur></span>
                                <span>{t('monteCarlo.logs.paramStocks')}: {formatDecimal(fixedParameters.stocksPercent)}%</span>
                                <span>{t('monteCarlo.logs.paramBonds')}: {formatDecimal(fixedParameters.bondsPercent)}%</span>
                                <span>{t('monteCarlo.logs.paramCash')}: {formatDecimal(fixedParameters.cashPercent)}%</span>
                                <span>{t('monteCarlo.logs.paramStockReturn')}: {formatDecimal(fixedParameters.expectedStockReturn)}%</span>
                                <span>{t('monteCarlo.logs.paramBondReturn')}: {formatDecimal(fixedParameters.expectedBondReturn)}%</span>
                                <span>{t('monteCarlo.logs.paramInflation')}: {formatDecimal(Math.abs(fixedParameters.expectedCashReturn))}%</span>
                                <span>{t('monteCarlo.logs.paramWithdrawalRate')}: {formatDecimal(fixedParameters.desiredWithdrawalRate)}%</span>
                                <span>{t('monteCarlo.logs.paramStockVolatility')}: {formatDecimal(fixedParameters.stockVolatility)}%</span>
                                <span>{t('monteCarlo.logs.paramBondVolatility')}: {formatDecimal(fixedParameters.bondVolatility)}%</span>
                              </div>
                            </div>
                            {/* Yearly breakdown table */}
                            <div className="mc-logs-detail-table-container">
                              <table className="mc-logs-detail-table" role="grid">
                                <thead>
                                  <tr>
                                    <th scope="col">{t('monteCarlo.logs.tableYear')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableAge')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableStockReturn')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableBondReturn')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableInflation')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tablePortfolioReturn')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableBlackSwan')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableExpenses')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableLaborIncome')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tablePortfolioValue')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableWithdrawalPct')}</th>
                                    <th scope="col">{t('monteCarlo.logs.tableFIRE')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {log.yearlyData.map((yearData) => (
                                    <tr 
                                      key={yearData.year}
                                      className={yearData.isBlackSwan ? 'black-swan-year' : yearData.isFIREAchieved ? 'fire-achieved' : ''}
                                    >
                                      <td>{yearData.year}</td>
                                      <td>{yearData.age}</td>
                                      <td className={yearData.stockReturn < 0 ? 'negative' : 'positive'}>
                                        {formatDisplayPercent(yearData.stockReturn)}
                                      </td>
                                      <td className={yearData.bondReturn < 0 ? 'negative' : 'positive'}>
                                        {formatDisplayPercent(yearData.bondReturn)}
                                      </td>
                                      <td className="inflation-cell">
                                        {formatDecimal(yearData.simulatedInflation || Math.abs(yearData.cashReturn))}%
                                      </td>
                                      <td className={yearData.portfolioReturn < 0 ? 'negative' : 'positive'}>
                                        {formatDisplayPercent(yearData.portfolioReturn)}
                                      </td>
                                      <td>
                                        {yearData.isBlackSwan && (
                                         <span className="black-swan-indicator" title={t('monteCarlo.logs.blackSwanEvent')}>
                                            <MaterialIcon name="warning" />
                                          </span>
                                        )}
                                      </td>
                                      <td>
                                        <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                                          {formatDisplayCurrency(yearData.expenses, defaultCurrency)}
                                        </PrivacyBlur>
                                      </td>
                                      <td>
                                        <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                                          {formatDisplayCurrency(yearData.laborIncome, defaultCurrency)}
                                        </PrivacyBlur>
                                      </td>
                                      <td>
                                        <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                                          {formatDisplayCurrency(yearData.portfolioValue, defaultCurrency)}
                                        </PrivacyBlur>
                                      </td>
                                      <td className={yearData.withdrawalRate && yearData.withdrawalRate > 6 ? 'negative' : ''}>
                                        {yearData.withdrawalRate ? `${formatDecimal(yearData.withdrawalRate)}%` : '-'}
                                      </td>
                                      <td>
                                        {yearData.isFIREAchieved && (
                                         <span className="fire-indicator" title={t('monteCarlo.logs.fireAchieved')}>
                                            <MaterialIcon name="local_fire_department" />
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mc-logs-pagination">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                aria-label={t('monteCarlo.logs.paginationFirst')}
              >
                <MaterialIcon name="first_page" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label={t('monteCarlo.logs.paginationPrev')}
              >
                <MaterialIcon name="chevron_left" />
              </button>
              <span className="mc-logs-page-info">
                {t('monteCarlo.logs.paginationInfo', { current: currentPage, total: totalPages, count: filteredLogs.length })}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label={t('monteCarlo.logs.paginationNext')}
              >
                <MaterialIcon name="chevron_right" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                aria-label={t('monteCarlo.logs.paginationLast')}
              >
                <MaterialIcon name="last_page" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
