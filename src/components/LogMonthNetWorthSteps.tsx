import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createEmptyMonthlySnapshot,
  generateNetWorthId,
  PENSION_TYPES,
  type AssetHolding,
  type MonthlySnapshot,
  type NetWorthTrackerData,
  type PensionEntry,
} from '../types/netWorthTracker';
import { logger } from '../utils/logger';
import {
  findNetWorthMonth,
  findPreviousNetWorthMonth,
  formatPeriod,
  isIncompleteNumberInput,
  parseNumberInput,
  periodKey,
  type MonthPeriod,
} from '../utils/monthLog';
import { calculateMonthlyNetWorth } from '../utils/netWorthCalculator';
import {
  applyNetWorthMonthPrices,
  fetchNetWorthMonthPrices,
  updateNetWorthMonth,
} from '../utils/netWorthMonthLog';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { MaterialIcon } from './MaterialIcon';
import { PreloadLink } from './PreloadLink';
import { PrivacyBlur } from './PrivacyBlur';

type NetWorthUpdate = (current: NetWorthTrackerData) => NetWorthTrackerData;

interface NetWorthStepProps {
  period: MonthPeriod;
  data: NetWorthTrackerData | null;
  /** Editing is unavailable (demo or unreadable saved data). */
  readOnly: boolean;
  privacy: boolean;
  netWorthPath: string;
  /** Apply and persist a change; returns false when it could not be saved. */
  onCommit: (update: NetWorthUpdate) => boolean;
}

export interface LogMonthInvestmentsStepProps extends NetWorthStepProps {
  onStart: () => void;
}

export function signedCurrency(value: number, currency?: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatDisplayCurrency(Math.abs(value), currency)}`;
}

function holdingValue(asset: AssetHolding): number {
  return calculateMonthlyNetWorth({ ...createEmptyMonthlySnapshot(0, 1), assets: [asset] }).totalAssetValue;
}

function byName<T>(items: T[] | undefined, name: (item: T) => string): Map<string, T> {
  return new Map((items ?? []).map(item => [name(item).trim().toLowerCase(), item]));
}

interface NumberCellProps {
  id: string;
  label: string;
  value: number;
  allowNegative?: boolean;
  disabled?: boolean;
  errorText: string;
  onCommit: (value: number) => void;
}

/** Number input that persists every valid value and keeps invalid text until corrected. */
function NumberCell({ id, label, value, allowNegative = false, disabled, errorText, onCommit }: NumberCellProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const text = draft ?? String(value);
  const invalid = draft !== null && parseNumberInput(draft, { allowNegative }) === null;
  // Partial input such as "-" is only reported once the field is left.
  const showError = invalid && (left || !isIncompleteNumberInput(draft ?? ''));
  return (
    <div className="log-month-number">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="input log-month-number-input"
        aria-label={label}
        value={text}
        disabled={disabled}
        aria-invalid={showError ? true : undefined}
        aria-describedby={showError ? `${id}-error` : undefined}
        autoComplete="off"
        onChange={event => {
          const next = event.target.value;
          setDraft(next);
          setLeft(false);
          const parsed = parseNumberInput(next, { allowNegative });
          if (parsed !== null && parsed !== value) onCommit(parsed);
        }}
        onBlur={() => {
          if (invalid) setLeft(true);
          else setDraft(null);
        }}
      />
      {showError && <span id={`${id}-error`} className="field__error">{errorText}</span>}
    </div>
  );
}

function ChangeCell({ value, currency, privacy }: { value: number | null; currency?: string; privacy: boolean }) {
  const { t } = useTranslation();
  if (value === null) return <span className="log-month-muted">{t('logMonth.investments.new')}</span>;
  return <PrivacyBlur isPrivacyMode={privacy}>{signedCurrency(value, currency)}</PrivacyBlur>;
}

function HiddenValuesNotice() {
  const { t } = useTranslation();
  return (
    <div className="callout callout--info">
      <MaterialIcon name="visibility_off" size="small" />
      <p>{t('logMonth.showValuesToEdit')}</p>
    </div>
  );
}

function MissingSnapshot({ period, previous, readOnly, onStart }: {
  period: MonthPeriod; previous: MonthlySnapshot | null; readOnly: boolean; onStart: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  return (
    <div className="log-month-start">
      <p>{t('logMonth.investments.noSnapshot', { month: formatPeriod(period, language) })}</p>
      <p className="field__hint">{previous ? t('logMonth.investments.startHint') : t('logMonth.investments.startEmptyHint')}</p>
      <button type="button" className="btn btn--primary" onClick={onStart} disabled={readOnly}
        aria-describedby={readOnly ? 'log-month-read-only' : undefined}>
        <MaterialIcon name="playlist_add" size="small" />
        {previous
          ? t('logMonth.investments.startFrom', { month: formatPeriod(previous, language) })
          : t('logMonth.investments.startEmpty')}
      </button>
    </div>
  );
}

type PriceStatus = { tone: 'busy' | 'success' | 'error'; text: string } | null;

export function LogMonthInvestmentsStep({
  period, data, readOnly, privacy, netWorthPath, onCommit, onStart,
}: LogMonthInvestmentsStepProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const snapshot = data ? findNetWorthMonth(data, period.year, period.month) : undefined;
  const previous = data ? findPreviousNetWorthMonth(data, period.year, period.month) : null;
  const currency = data?.defaultCurrency;
  const idPrefix = `log-month-investments-${periodKey(period)}`;
  const [priceStatus, setPriceStatus] = useState<PriceStatus>(null);
  const priceRequest = useRef(0);

  useEffect(() => () => {
    priceRequest.current += 1;
  }, []);

  if (!snapshot) {
    return <MissingSnapshot period={period} previous={previous} readOnly={readOnly} onStart={onStart} />;
  }

  const previousAssets = byName(previous?.assets, asset => asset.name);
  const previousCash = byName(previous?.cashEntries, entry => entry.accountName);
  const holdingsTotal = snapshot.assets.reduce((sum, asset) => sum + holdingValue(asset), 0);
  const cashTotal = snapshot.cashEntries.reduce((sum, entry) => sum + entry.balance, 0);
  const previousHoldingsTotal = previous ? previous.assets.reduce((sum, asset) => sum + holdingValue(asset), 0) : null;
  const previousCashTotal = previous ? previous.cashEntries.reduce((sum, entry) => sum + entry.balance, 0) : null;
  const tickers = snapshot.assets.map(asset => asset.ticker?.trim()).filter((ticker): ticker is string => Boolean(ticker));
  const editable = !readOnly && !privacy;

  const updateAsset = (id: string, patch: Partial<Pick<AssetHolding, 'shares' | 'pricePerShare'>>) => {
    onCommit(current => updateNetWorthMonth(current, period.year, period.month, month => {
      const asset = month.assets.find(item => item.id === id);
      if (asset) Object.assign(asset, patch);
    }));
  };

  const updateCash = (id: string, balance: number) => {
    onCommit(current => updateNetWorthMonth(current, period.year, period.month, month => {
      const entry = month.cashEntries.find(item => item.id === id);
      if (entry) entry.balance = balance;
    }));
  };

  const fetchPrices = async () => {
    const request = ++priceRequest.current;
    setPriceStatus({ tone: 'busy', text: t('logMonth.investments.fetchingPrices') });
    try {
      const prices = await fetchNetWorthMonthPrices(tickers, period.year, period.month);
      if (request !== priceRequest.current) return;
      const count = Object.keys(prices).length;
      if (count === 0) {
        setPriceStatus({ tone: 'error', text: t('logMonth.investments.pricesUnavailable') });
        return;
      }
      const saved = onCommit(current => applyNetWorthMonthPrices(current, period.year, period.month, prices));
      setPriceStatus(saved ? { tone: 'success', text: t('logMonth.investments.pricesUpdated', { count }) } : null);
    } catch (error) {
      if (request !== priceRequest.current) return;
      logger.warn('log-month', 'price-fetch-failed', 'month-end prices could not be fetched', {
        pii: { error: error instanceof Error ? error.message : String(error) },
      });
      setPriceStatus({ tone: 'error', text: t('logMonth.investments.pricesFailed') });
    }
  };

  return (
    <div className="log-month-step-body">
      {privacy && <HiddenValuesNotice />}
      <section className="log-month-section" aria-labelledby={`${idPrefix}-holdings`}>
        <div className="log-month-section__header">
          <h3 id={`${idPrefix}-holdings`}>{t('logMonth.investments.holdings')}</h3>
          {tickers.length > 0 && (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void fetchPrices()}
              disabled={!editable || priceStatus?.tone === 'busy'}>
              <MaterialIcon name="sync" size="small" />
              {t('logMonth.investments.fetchPrices')}
            </button>
          )}
        </div>
        {previous && <p className="field__hint">{t('logMonth.investments.compareHint', { month: formatPeriod(previous, language) })}</p>}
        <div aria-live="polite" className="log-month-live">
          {priceStatus && (
            <p className={priceStatus.tone === 'error' ? 'field__error' : priceStatus.tone === 'success' ? 'log-month-success' : 'field__hint'}>
              {priceStatus.text}
            </p>
          )}
        </div>
        {snapshot.assets.length ? (
          <div className="log-month-table-scroll" tabIndex={0} role="region" aria-labelledby={`${idPrefix}-holdings`}>
            <table className="data-table log-month-table">
              <thead>
                <tr>
                  <th scope="col">{t('logMonth.investments.name')}</th>
                  <th scope="col" className="num">{t('logMonth.investments.shares')}</th>
                  <th scope="col" className="num">{t('logMonth.investments.price')}</th>
                  <th scope="col" className="num">{t('logMonth.investments.value')}</th>
                  <th scope="col" className="num">{t('logMonth.investments.change')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.assets.map(asset => {
                  const prior = previousAssets.get(asset.name.trim().toLowerCase());
                  const value = holdingValue(asset);
                  const computed = asset.assetClass === 'VEHICLE' && Boolean(asset.vehicleDepreciation);
                  return (
                    <tr key={asset.id}>
                      <th scope="row" className="log-month-row-name">
                        <span>{asset.name}</span>
                        {asset.ticker && <span className="log-month-muted">{asset.ticker}</span>}
                      </th>
                      <td className="num">
                        {editable && !computed ? (
                          <NumberCell id={`${idPrefix}-${asset.id}-shares`} label={t('logMonth.investments.sharesFor', { name: asset.name })}
                            value={asset.shares} errorText={t('logMonth.errors.invalidAmount')}
                            onCommit={shares => updateAsset(asset.id, { shares })} />
                        ) : <PrivacyBlur isPrivacyMode={privacy}>{asset.shares}</PrivacyBlur>}
                      </td>
                      <td className="num">
                        {editable && !computed ? (
                          <NumberCell id={`${idPrefix}-${asset.id}-price`} label={t('logMonth.investments.priceFor', { name: asset.name })}
                            value={asset.pricePerShare} errorText={t('logMonth.errors.invalidAmount')}
                            onCommit={pricePerShare => updateAsset(asset.id, { pricePerShare })} />
                        ) : <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(asset.pricePerShare, asset.currency)}</PrivacyBlur>}
                      </td>
                      <td className="num"><PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(value, currency)}</PrivacyBlur></td>
                      <td className="num"><ChangeCell value={prior ? value - holdingValue(prior) : null} currency={currency} privacy={privacy} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>{t('logMonth.investments.totalHoldings')}</th>
                  <td className="num"><PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(holdingsTotal, currency)}</PrivacyBlur></td>
                  <td className="num">
                    <ChangeCell value={previousHoldingsTotal === null ? null : holdingsTotal - previousHoldingsTotal} currency={currency} privacy={privacy} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <p className="log-month-empty">{t('logMonth.investments.noHoldings')}</p>}
      </section>

      <section className="log-month-section" aria-labelledby={`${idPrefix}-cash`}>
        <div className="log-month-section__header">
          <h3 id={`${idPrefix}-cash`}>{t('logMonth.investments.cash')}</h3>
        </div>
        {snapshot.cashEntries.length ? (
          <div className="log-month-table-scroll" tabIndex={0} role="region" aria-labelledby={`${idPrefix}-cash`}>
            <table className="data-table log-month-table">
              <thead>
                <tr>
                  <th scope="col">{t('logMonth.investments.account')}</th>
                  <th scope="col" className="num">{t('logMonth.investments.balance')}</th>
                  <th scope="col" className="num">{t('logMonth.investments.change')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.cashEntries.map(entry => {
                  const prior = previousCash.get(entry.accountName.trim().toLowerCase());
                  return (
                    <tr key={entry.id}>
                      <th scope="row" className="log-month-row-name">
                        <span>{entry.accountName}</span>
                        {entry.institutionName && <span className="log-month-muted">{entry.institutionName}</span>}
                      </th>
                      <td className="num">
                        {editable ? (
                          <NumberCell id={`${idPrefix}-${entry.id}-balance`} label={t('logMonth.investments.balanceFor', { name: entry.accountName })}
                            value={entry.balance} allowNegative errorText={t('logMonth.errors.invalidNumber')}
                            onCommit={balance => updateCash(entry.id, balance)} />
                        ) : <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(entry.balance, entry.currency)}</PrivacyBlur>}
                      </td>
                      <td className="num"><ChangeCell value={prior ? entry.balance - prior.balance : null} currency={currency} privacy={privacy} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('logMonth.investments.totalCash')}</th>
                  <td className="num"><PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(cashTotal, currency)}</PrivacyBlur></td>
                  <td className="num">
                    <ChangeCell value={previousCashTotal === null ? null : cashTotal - previousCashTotal} currency={currency} privacy={privacy} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <p className="log-month-empty">{t('logMonth.investments.noCash')}</p>}
        <p className="field__hint">
          {t('logMonth.investments.advanced')}{' '}
          <PreloadLink to={netWorthPath}>{t('logMonth.openNetWorth')}</PreloadLink>
        </p>
      </section>
    </div>
  );
}

export interface LogMonthPensionStepProps extends NetWorthStepProps {
  onOpenInvestments: () => void;
}

export function LogMonthPensionStep({
  period, data, readOnly, privacy, netWorthPath, onCommit, onOpenInvestments,
}: LogMonthPensionStepProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const snapshot = data ? findNetWorthMonth(data, period.year, period.month) : undefined;
  const previous = data ? findPreviousNetWorthMonth(data, period.year, period.month) : null;
  const currency = data?.defaultCurrency;
  const idPrefix = `log-month-pension-${periodKey(period)}`;
  const [name, setName] = useState('');
  const [pensionType, setPensionType] = useState<PensionEntry['pensionType']>('PRIVATE');
  const [value, setValue] = useState('');
  const [formError, setFormError] = useState<{ name?: string; value?: string }>({});
  const [added, setAdded] = useState<string | null>(null);

  if (!snapshot) {
    return (
      <div className="log-month-start">
        <p>{t('logMonth.pension.noSnapshot', { month: formatPeriod(period, language) })}</p>
        <button type="button" className="btn btn--secondary" onClick={onOpenInvestments}>
          {t('logMonth.pension.goToInvestments')}
        </button>
      </div>
    );
  }

  const previousPensions = byName(previous?.pensions, pension => pension.name);
  const total = snapshot.pensions.reduce((sum, pension) => sum + pension.currentValue, 0);
  const previousTotal = previous ? previous.pensions.reduce((sum, pension) => sum + pension.currentValue, 0) : null;
  const editable = !readOnly && !privacy;

  const updatePension = (id: string, currentValue: number) => {
    onCommit(current => updateNetWorthMonth(current, period.year, period.month, month => {
      const pension = month.pensions.find(item => item.id === id);
      if (pension) pension.currentValue = currentValue;
    }));
  };

  const addPension = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const parsed = parseNumberInput(value);
    const errors: { name?: string; value?: string } = {};
    if (!trimmed) errors.name = t('logMonth.errors.required');
    else if (snapshot.pensions.some(pension => pension.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      errors.name = t('logMonth.pension.nameExists');
    }
    if (parsed === null) errors.value = t('logMonth.errors.invalidAmount');
    setFormError(errors);
    if (errors.name || errors.value || parsed === null) return;
    const pension: PensionEntry = {
      id: generateNetWorthId(), name: trimmed, pensionType, currentValue: parsed, currency: currency ?? 'EUR',
    };
    if (onCommit(current => updateNetWorthMonth(current, period.year, period.month, month => {
      month.pensions.push(pension);
    }))) {
      setName('');
      setValue('');
      setAdded(t('logMonth.pension.added', { name: trimmed }));
    }
  };

  return (
    <div className="log-month-step-body">
      {privacy && <HiddenValuesNotice />}
      {data && !data.settings.showPensionInNetWorth && (
        <div className="callout callout--info">
          <MaterialIcon name="info" size="small" />
          <p>{t('logMonth.pension.excluded')}</p>
        </div>
      )}
      <section className="log-month-section" aria-labelledby={`${idPrefix}-list`}>
        <div className="log-month-section__header">
          <h3 id={`${idPrefix}-list`}>{t('logMonth.pension.listTitle')}</h3>
        </div>
        {previous && <p className="field__hint">{t('logMonth.investments.compareHint', { month: formatPeriod(previous, language) })}</p>}
        {snapshot.pensions.length ? (
          <div className="log-month-table-scroll" tabIndex={0} role="region" aria-labelledby={`${idPrefix}-list`}>
            <table className="data-table log-month-table">
              <thead>
                <tr>
                  <th scope="col">{t('logMonth.pension.name')}</th>
                  <th scope="col" className="num">{t('logMonth.pension.previous')}</th>
                  <th scope="col" className="num">{t('logMonth.pension.value')}</th>
                  <th scope="col" className="num">{t('logMonth.investments.change')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.pensions.map(pension => {
                  const prior = previousPensions.get(pension.name.trim().toLowerCase());
                  return (
                    <tr key={pension.id}>
                      <th scope="row" className="log-month-row-name">
                        <span>{pension.name}</span>
                        <span className="log-month-muted">{t(`logMonth.pension.types.${pension.pensionType}`)}</span>
                      </th>
                      <td className="num">
                        {prior ? <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(prior.currentValue, prior.currency)}</PrivacyBlur>
                          : <span className="log-month-muted">{t('logMonth.investments.new')}</span>}
                      </td>
                      <td className="num">
                        {editable ? (
                          <NumberCell id={`${idPrefix}-${pension.id}-value`} label={t('logMonth.pension.valueFor', { name: pension.name })}
                            value={pension.currentValue} errorText={t('logMonth.errors.invalidAmount')}
                            onCommit={next => updatePension(pension.id, next)} />
                        ) : <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(pension.currentValue, pension.currency)}</PrivacyBlur>}
                      </td>
                      <td className="num">
                        <ChangeCell value={prior ? pension.currentValue - prior.currentValue : null} currency={currency} privacy={privacy} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2}>{t('logMonth.pension.total')}</th>
                  <td className="num"><PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(total, currency)}</PrivacyBlur></td>
                  <td className="num">
                    <ChangeCell value={previousTotal === null ? null : total - previousTotal} currency={currency} privacy={privacy} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <p className="log-month-empty">{t('logMonth.pension.empty')}</p>}
      </section>

      <section className="log-month-section" aria-labelledby={`${idPrefix}-add`}>
        <div className="log-month-section__header">
          <h3 id={`${idPrefix}-add`}>{t('logMonth.pension.add')}</h3>
        </div>
        <form className="log-month-pension-form" onSubmit={addPension} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={`${idPrefix}-new-name`}>{t('logMonth.pension.name')}</label>
            <input id={`${idPrefix}-new-name`} type="text" value={name} autoComplete="off"
              onChange={event => setName(event.target.value)}
              aria-invalid={formError.name ? true : undefined}
              aria-describedby={formError.name ? `${idPrefix}-new-name-error` : undefined} />
            {formError.name && <span id={`${idPrefix}-new-name-error`} className="field__error">{formError.name}</span>}
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${idPrefix}-new-type`}>{t('logMonth.pension.type')}</label>
            <select id={`${idPrefix}-new-type`} value={pensionType}
              onChange={event => setPensionType(event.target.value as PensionEntry['pensionType'])}>
              {PENSION_TYPES.map(type => <option key={type.id} value={type.id}>{t(`logMonth.pension.types.${type.id}`)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${idPrefix}-new-value`}>{t('logMonth.pension.value')}</label>
            <input id={`${idPrefix}-new-value`} type="text" inputMode="decimal" className="log-month-number-input"
              value={value} autoComplete="off" onChange={event => setValue(event.target.value)}
              aria-invalid={formError.value ? true : undefined}
              aria-describedby={formError.value ? `${idPrefix}-new-value-error` : undefined} />
            {formError.value && <span id={`${idPrefix}-new-value-error`} className="field__error">{formError.value}</span>}
          </div>
          <button type="submit" className="btn btn--secondary" disabled={readOnly}
            aria-describedby={readOnly ? 'log-month-read-only' : undefined}>
            <MaterialIcon name="add" size="small" />
            {t('logMonth.pension.addButton')}
          </button>
        </form>
        <div aria-live="polite" className="log-month-live">
          {added && <p className="log-month-success">{added}</p>}
        </div>
        <p className="field__hint">
          {t('logMonth.pension.contributionHint')}{' '}
          <PreloadLink to={netWorthPath}>{t('logMonth.openNetWorth')}</PreloadLink>
        </p>
      </section>
    </div>
  );
}
