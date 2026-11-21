/**
 * Investment operations workbook: one row per trade or cash event (buy, sell,
 * dividend, fee, tax). Imports record Net Worth Tracker operations in the
 * matching months and derive average cost (acquisition price) and ISIN for
 * holdings whose quantity matches the ledger.
 *
 * Imported operations use ids starting with "wbo-"; importing again replaces
 * them and never touches operations you entered yourself.
 */

import promptDocument from '../../docs/user/operations-import-agent-prompt.md?raw';
import { serialToDate, type XlsxCell, type XlsxSheet, type XlsxWorkbook } from './xlsxReader';
import { writeXlsxWorkbook, XLSX_MIME_TYPE, type XlsxWriteSheet, type XlsxWriteValue } from './xlsxWriter';
import { OPERATIONS_WORKBOOK_ID_PREFIX, normalizeText, parseNumericCell, tickerKey } from './workbookImport';
import { convertAmount } from './currencyConverter';
import { downloadFile } from './dataExportImport';
import { SUPPORTED_CURRENCIES, type ExchangeRates, type SupportedCurrency } from '../types/currency';
import type { Asset } from '../types/assetAllocation';
import type {
  AssetHolding,
  FinancialOperation,
  MonthlySnapshot,
  NetWorthTrackerData,
  OperationType,
} from '../types/netWorthTracker';

export interface OperationsWorkbookOptions {
  targetCurrency: SupportedCurrency;
  /** App exchange rates relative to `targetCurrency`. */
  fallbackRates: ExchangeRates;
}

export interface ParsedOperation {
  /** Stable within the workbook: sheet and row. */
  key: string;
  sheet: string;
  row: number;
  date: string;
  type: OperationType;
  action: string;
  name: string;
  ticker: string;
  isin: string;
  quantity: number | null;
  /** Unit price in the row currency. */
  price: number | null;
  /** Fee in the row currency. */
  fee: number;
  /** Total in the row currency: gross + fee for outflows, gross − fee for inflows. */
  nativeAmount: number;
  currency: SupportedCurrency;
  /** Total converted to the target currency. */
  amount: number;
  broker: string;
  exchange: string;
  notes: string;
}

export type OperationsWarningCode =
  | 'unknownAction'
  | 'invalidDate'
  | 'ambiguousDate'
  | 'missingAmount'
  | 'unsupportedCurrency'
  | 'fallbackRate';

export interface OperationsWarning {
  code: OperationsWarningCode;
  sheet: string;
  row?: number;
  detail?: string;
}

export interface OperationsWorkbookPlan {
  currency: SupportedCurrency;
  operations: ParsedOperation[];
  sheets: string[];
  ignoredSheets: string[];
  warnings: OperationsWarning[];
}

const SUPPORTED_CODES = new Set<string>(SUPPORTED_CURRENCIES.map((currency) => currency.code));

function cellText(cell: XlsxCell | undefined): string {
  return cell && cell.value !== null ? String(cell.value).trim() : '';
}

function headerText(cell: XlsxCell | undefined): string {
  return normalizeText(cellText(cell)).replace(/\.$/, '');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Operation type from an action label in any supported language. */
export function operationTypeFromAction(action: string): OperationType | null {
  const text = normalizeText(action).replace(/[_-]+/g, ' ');
  if (!text) return null;
  if (/\b(sell|sale|sold|vendita|vendi|verkauf|vente|venta)\b/.test(text)) return 'SALE';
  if (/\b(buy|bought|purchase|ipo|subscribe|subscription|acquisto|compra|kauf|achat)\b/.test(text)) return 'PURCHASE';
  // Before dividends: "Dividend tax" or "withholding on dividends" is a tax outflow.
  if (/\b(tax|taxes|withholding|tassa|imposta|steuer|impot|impuesto)\b/.test(text)) return 'TAX_PAID';
  if (/\b(dividend|dividends|div|coupon|interest|cedola|dividendo|dividende)\b/.test(text)) return 'DIVIDEND';
  if (/\b(fee|fees|commission|costs?|commissione|gebuhr|frais|comision)\b/.test(text)) return 'OTHER';
  if (/\b(transfer|deposit|withdrawal|split|bonifico|uberweisung|virement|transferencia)\b/.test(text)) return 'CASH_TRANSFER';
  return null;
}

function validDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parse a trade date. Text dates like 03/04/2024 are read day-first unless
 * only a month-first reading is possible; ambiguous ones are reported.
 */
function parseTradeDate(cell: XlsxCell | undefined, date1904: boolean): { date: string | null; ambiguous: boolean } {
  if (!cell || cell.value === null || cell.value === '') return { date: null, ambiguous: false };
  if (typeof cell.value === 'number') {
    const date = serialToDate(cell.value, date1904);
    return { date: date ? validDate(date.year, date.month, date.day) : null, ambiguous: false };
  }
  const text = String(cell.value).trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(text);
  if (match) return { date: validDate(Number(match[1]), Number(match[2]), Number(match[3])), ambiguous: false };
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (!match) return { date: null, ambiguous: false };
  const [first, second, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (first > 12) return { date: validDate(year, second, first), ambiguous: false };
  if (second > 12) return { date: validDate(year, first, second), ambiguous: false };
  return { date: validDate(year, second, first), ambiguous: first !== second };
}

interface OperationColumns {
  headerRow: number;
  date: number;
  action: number;
  name?: number;
  ticker?: number;
  isin?: number;
  quantity?: number;
  price?: number;
  priceBuy?: number;
  priceSell?: number;
  fee?: number;
  feeBuy?: number;
  feeSell?: number;
  amount?: number;
  /** A total that already includes the fee. */
  netAmount?: number;
  currency?: number;
  fx?: number;
  broker?: number;
  exchange?: number;
  notes?: number;
}

function findColumns(sheet: XlsxSheet): OperationColumns | null {
  for (let row = 1; row <= Math.min(sheet.maxRow, 10); row++) {
    const cells = sheet.rows.get(row);
    if (!cells) continue;
    const ordered = [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([column, cell]) => [column, headerText(cell)] as const);
    const find = (pattern: RegExp) => ordered.find(([, text]) => pattern.test(text))?.[0];
    const date = find(/^(date|trade date|execution date|data|datum|fecha)$/);
    const action = find(/^(action|operation|side|transaction|azione|operazione|aktion|operacion|accion)$/);
    if (date === undefined || action === undefined) continue;
    return {
      headerRow: row, date, action,
      name: find(/^(name|description|security|instrument|product|nome|titolo|bezeichnung|nom|nombre)$/),
      ticker: find(/^(ticker|symbol|simbolo)$/),
      isin: find(/^isin$/),
      quantity: find(/^(qty|quantity|shares|units|quantita|anzahl|stuck|quantite|cantidad)$/),
      price: find(/^(price|unit price|prezzo|kurs|prix|precio)$/),
      priceBuy: find(/^price \((buy|purchase)\)$/),
      priceSell: find(/^price \((sell|sale)\)$/),
      fee: find(/^(fee|fees|commission|commissions|costs?|commissione|gebuhr|frais|comision)$/),
      feeBuy: find(/^fees? \((buy|purchase)\)$/),
      feeSell: find(/^fees? \((sell|sale)\)$/),
      amount: find(/^(amount|gross amount|gross|importo|betrag|montant|importe)$/),
      netAmount: find(/^(net amount|total|net total|totale|netto|net)$/),
      currency: find(/^(cur|curr|currency|ccy|valuta|wahrung|devise|moneda|divisa)$/),
      fx: find(/^(fx|fx rate|exchange rate|rate|cambio|fx \((buy|trade)\))$/),
      broker: find(/^(broker|account|intermediario)$/),
      exchange: find(/^(exchange|market|borsa|borse|bourse|bolsa)$/),
      notes: find(/^(notes?|comments?)$/),
    };
  }
  return null;
}

function parseOperationsSheet(
  sheet: XlsxSheet,
  columns: OperationColumns,
  workbook: XlsxWorkbook,
  options: OperationsWorkbookOptions,
  warnings: OperationsWarning[],
  fallbackWarned: Set<string>,
): ParsedOperation[] {
  const operations: ParsedOperation[] = [];
  const text = (cells: Map<number, XlsxCell>, column?: number) => (column ? cellText(cells.get(column)) : '');
  const number = (cells: Map<number, XlsxCell>, column?: number) => (column ? parseNumericCell(cells.get(column)) : null);

  for (const [row, cells] of [...sheet.rows.entries()].sort((a, b) => a[0] - b[0])) {
    if (row <= columns.headerRow) continue;
    const action = text(cells, columns.action);
    const name = text(cells, columns.name);
    const ticker = text(cells, columns.ticker);
    if (!action && !name && !ticker) continue;
    const type = operationTypeFromAction(action);
    if (!type) {
      warnings.push({ code: 'unknownAction', sheet: sheet.name, row, detail: action || '(empty)' });
      continue;
    }
    const parsedDate = parseTradeDate(cells.get(columns.date), workbook.date1904);
    if (!parsedDate.date) {
      warnings.push({ code: 'invalidDate', sheet: sheet.name, row, detail: text(cells, columns.date) || '(empty)' });
      continue;
    }
    if (parsedDate.ambiguous) warnings.push({ code: 'ambiguousDate', sheet: sheet.name, row, detail: parsedDate.date });

    const currencyText = text(cells, columns.currency).toUpperCase();
    if (currencyText && !SUPPORTED_CODES.has(currencyText)) {
      warnings.push({ code: 'unsupportedCurrency', sheet: sheet.name, row, detail: currencyText });
      continue;
    }
    const currency = (currencyText || options.targetCurrency) as SupportedCurrency;

    const isSale = type === 'SALE';
    const quantityValue = number(cells, columns.quantity);
    const quantity = quantityValue === null ? null : Math.abs(quantityValue);
    const price = number(cells, isSale ? columns.priceSell ?? columns.price : columns.priceBuy ?? columns.price);
    const fee = Math.abs(number(cells, isSale ? columns.feeSell ?? columns.fee : columns.feeBuy ?? columns.fee) ?? 0);
    const explicitAmount = number(cells, columns.amount);
    const netAmount = number(cells, columns.netAmount);
    const gross = explicitAmount !== null && explicitAmount !== 0
      ? Math.abs(explicitAmount)
      : quantity !== null && price !== null && quantity > 0 && price > 0 ? quantity * price : null;
    if (gross === null && (netAmount === null || netAmount === 0)) {
      warnings.push({ code: 'missingAmount', sheet: sheet.name, row, detail: name || ticker });
      continue;
    }
    const outflow = type === 'PURCHASE' || type === 'TAX_PAID' || type === 'OTHER';
    // A net amount or total already includes the fee.
    const nativeAmount = netAmount !== null && netAmount !== 0
      ? Math.abs(netAmount)
      : outflow ? (gross as number) + fee : Math.max(0, (gross as number) - fee);

    let amount = nativeAmount;
    if (currency !== options.targetCurrency) {
      const fx = number(cells, columns.fx);
      if (fx !== null && fx > 0) {
        amount = nativeAmount * fx;
      } else {
        amount = convertAmount(nativeAmount, currency, options.targetCurrency, options.fallbackRates);
        if (!fallbackWarned.has(currency)) {
          fallbackWarned.add(currency);
          warnings.push({ code: 'fallbackRate', sheet: sheet.name, row, detail: `${currency}→${options.targetCurrency}` });
        }
      }
    }

    operations.push({
      key: `${sheet.name}:${row}`,
      sheet: sheet.name, row, date: parsedDate.date, type, action, name, ticker,
      isin: text(cells, columns.isin).toUpperCase().replace(/\s+/g, ''),
      quantity, price, fee,
      nativeAmount: round(nativeAmount, 6), currency, amount: round(amount),
      broker: text(cells, columns.broker), exchange: text(cells, columns.exchange), notes: text(cells, columns.notes),
    });
  }
  return operations;
}

/** Build an import plan from an operations workbook. Pure: never writes storage. */
export function parseOperationsWorkbook(workbook: XlsxWorkbook, options: OperationsWorkbookOptions): OperationsWorkbookPlan {
  const warnings: OperationsWarning[] = [];
  const operations: ParsedOperation[] = [];
  const sheets: string[] = [];
  const ignoredSheets: string[] = [];
  const fallbackWarned = new Set<string>();
  for (const sheet of workbook.sheets) {
    const columns = /readme|example|sample|deprecated/.test(normalizeText(sheet.name)) ? null : findColumns(sheet);
    if (!columns) {
      ignoredSheets.push(sheet.name);
      continue;
    }
    sheets.push(sheet.name);
    operations.push(...parseOperationsSheet(sheet, columns, workbook, options, warnings, fallbackWarned));
  }
  // Rows of the same security may carry only a ticker or only an ISIN.
  const isinByTicker = new Map<string, string>();
  const tickerByIsin = new Map<string, string>();
  for (const operation of operations) {
    if (!operation.ticker || !operation.isin) continue;
    isinByTicker.set(tickerKey(operation.ticker), operation.isin);
    tickerByIsin.set(operation.isin, operation.ticker);
  }
  for (const operation of operations) {
    if (!operation.isin && operation.ticker) operation.isin = isinByTicker.get(tickerKey(operation.ticker)) ?? '';
    if (!operation.ticker && operation.isin) operation.ticker = tickerByIsin.get(operation.isin) ?? '';
  }
  // Stable sort: same-day operations keep their sheet and row order.
  operations.sort((a, b) => a.date.localeCompare(b.date));
  return { currency: options.targetCurrency, operations, sheets, ignoredSheets, warnings };
}

// ---------------------------------------------------------------------------
// Positions and cost basis
// ---------------------------------------------------------------------------

interface Position {
  quantity: number;
  /** Total cost in the target currency, including purchase fees. */
  cost: number;
  /** Total cost in the trade currency, when every trade used the same one. */
  nativeCost: number;
  currency: SupportedCurrency;
  mixedCurrencies: boolean;
  isin: string;
  tickers: Set<string>;
}

function instrumentKey(operation: ParsedOperation): string {
  if (operation.isin) return `isin:${operation.isin}`;
  if (operation.ticker) return `ticker:${tickerKey(operation.ticker)}`;
  return `name:${normalizeText(operation.name)}`;
}

function applyToPositions(positions: Map<string, Position>, operation: ParsedOperation): void {
  if ((operation.type !== 'PURCHASE' && operation.type !== 'SALE') || !operation.quantity) return;
  const key = instrumentKey(operation);
  const position = positions.get(key) ?? {
    quantity: 0, cost: 0, nativeCost: 0, currency: operation.currency, mixedCurrencies: false,
    isin: operation.isin, tickers: new Set<string>(),
  };
  if (operation.ticker) position.tickers.add(tickerKey(operation.ticker));
  if (operation.currency !== position.currency) position.mixedCurrencies = true;
  if (operation.type === 'PURCHASE') {
    position.quantity += operation.quantity;
    position.cost += operation.amount;
    position.nativeCost += operation.nativeAmount;
  } else if (position.quantity > 0) {
    const sold = Math.min(operation.quantity, position.quantity);
    const remaining = (position.quantity - sold) / position.quantity;
    position.cost *= remaining;
    position.nativeCost *= remaining;
    position.quantity -= sold;
    if (position.quantity <= 1e-9) {
      position.quantity = 0;
      position.cost = 0;
      position.nativeCost = 0;
    }
  }
  positions.set(key, position);
}

function findPosition(
  positions: Map<string, Position>,
  holding: { ticker: string; isin?: string },
): Position | undefined {
  const isin = holding.isin?.toUpperCase();
  if (isin) {
    const byIsin = positions.get(`isin:${isin}`);
    if (byIsin) return byIsin;
  }
  const key = tickerKey(holding.ticker);
  if (!key) return undefined;
  for (const position of positions.values()) {
    if (position.tickers.has(key)) return position;
  }
  return undefined;
}

/** True when the holding is the same position as the ledger (quantities agree within 1%). */
function sameQuantity(shares: number, position: Position): boolean {
  return position.quantity > 0 && Math.abs(shares - position.quantity) <= Math.max(position.quantity * 0.01, 1e-6);
}

/**
 * Set the average cost in the currency the holding is priced in: the target
 * currency, or the trade currency when every trade used it.
 */
function updateHolding<T extends { ticker: string; isin?: string; acquisitionPrice?: number }>(
  holding: T & { shares?: number },
  holdingCurrency: SupportedCurrency,
  targetCurrency: SupportedCurrency,
  positions: Map<string, Position>,
): boolean {
  const position = findPosition(positions, holding);
  if (!position || !holding.shares || !sameQuantity(holding.shares, position)) return false;
  let cost: number;
  if (holdingCurrency === targetCurrency) cost = position.cost;
  else if (holdingCurrency === position.currency && !position.mixedCurrencies) cost = position.nativeCost;
  else return false;
  holding.acquisitionPrice = round(cost / position.quantity, 6);
  if (!holding.isin && position.isin) holding.isin = position.isin;
  return true;
}

// ---------------------------------------------------------------------------
// Preview and apply
// ---------------------------------------------------------------------------

export interface OperationsImportSelection {
  recordOperations: boolean;
  updateCostBasis: boolean;
}

export interface OperationsImportPreview {
  operations: number;
  byType: Partial<Record<OperationType, number>>;
  firstDate: string | null;
  lastDate: string | null;
  instruments: number;
  /** Operations whose month has no Net Worth snapshot; they are not recorded. */
  withoutMonth: number;
}

export interface OperationsImportSummary {
  operationsImported: number;
  operationsWithoutMonth: number;
  holdingsUpdated: number;
  allocationAssetsUpdated: number;
}

export interface OperationsImportResult {
  netWorth?: NetWorthTrackerData;
  assets?: Asset[];
  summary: OperationsImportSummary;
}

function findSnapshot(data: NetWorthTrackerData | null, date: string): MonthlySnapshot | undefined {
  const [year, month] = date.split('-').map(Number);
  return data?.years.find((item) => item.year === year)?.months.find((item) => item.month === month);
}

export function previewOperationsImport(plan: OperationsWorkbookPlan, netWorth: NetWorthTrackerData | null): OperationsImportPreview {
  const byType: Partial<Record<OperationType, number>> = {};
  for (const operation of plan.operations) byType[operation.type] = (byType[operation.type] ?? 0) + 1;
  return {
    operations: plan.operations.length,
    byType,
    firstDate: plan.operations[0]?.date ?? null,
    lastDate: plan.operations[plan.operations.length - 1]?.date ?? null,
    instruments: new Set(plan.operations.map(instrumentKey)).size,
    withoutMonth: plan.operations.filter((operation) => !findSnapshot(netWorth, operation.date)).length,
  };
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value, 6));
}

function toFinancialOperation(operation: ParsedOperation, currency: SupportedCurrency, relatedAsset?: AssetHolding): FinancialOperation {
  const label = operation.ticker || operation.name;
  const description = operation.quantity
    ? `${operation.action.toUpperCase()} ${formatQuantity(operation.quantity)} × ${label}`
    : `${operation.action.toUpperCase()} ${label}`;
  const details = [
    operation.ticker && operation.name ? operation.name : '',
    operation.isin ? `ISIN ${operation.isin}` : '',
    operation.price !== null ? `price ${operation.price} ${operation.currency}` : '',
    operation.fee ? `fee ${operation.fee} ${operation.currency}` : '',
    operation.currency !== currency ? `total ${round(operation.nativeAmount)} ${operation.currency}` : '',
    operation.broker ? `broker ${operation.broker}` : '',
    operation.exchange ? `exchange ${operation.exchange}` : '',
    operation.notes,
  ].filter(Boolean);
  return {
    id: `${OPERATIONS_WORKBOOK_ID_PREFIX}${normalizeText(operation.sheet).replace(/[^a-z0-9]+/g, '-')}-${operation.row}`,
    date: operation.date,
    type: operation.type,
    description,
    amount: operation.amount,
    currency,
    ...(relatedAsset ? { relatedAssetId: relatedAsset.id } : {}),
    ...(details.length ? { note: details.join('; ') } : {}),
  };
}

/** Build the next Net Worth data and Asset Allocation assets without saving them. */
export function applyOperationsImport(
  plan: OperationsWorkbookPlan,
  current: { netWorth: NetWorthTrackerData | null; assets: Asset[] | null },
  selection: OperationsImportSelection,
): OperationsImportResult {
  const summary: OperationsImportSummary = {
    operationsImported: 0, operationsWithoutMonth: 0, holdingsUpdated: 0, allocationAssetsUpdated: 0,
  };
  const result: OperationsImportResult = { summary };

  if (current.netWorth && (selection.recordOperations || selection.updateCostBasis)) {
    const data: NetWorthTrackerData = structuredClone(current.netWorth);
    const snapshots = data.years
      .flatMap((year) => year.months)
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));

    if (selection.recordOperations) {
      for (const snapshot of snapshots) {
        snapshot.operations = snapshot.operations.filter((op) => !op.id.startsWith(OPERATIONS_WORKBOOK_ID_PREFIX));
      }
    }

    const positions = new Map<string, Position>();
    let next = 0;
    for (const snapshot of snapshots) {
      const monthEnd = `${snapshot.year}-${pad(snapshot.month)}-31`;
      const monthStart = `${snapshot.year}-${pad(snapshot.month)}-01`;
      while (next < plan.operations.length && plan.operations[next].date <= monthEnd) {
        const operation = plan.operations[next++];
        applyToPositions(positions, operation);
        if (!selection.recordOperations || operation.date < monthStart) continue;
        const related = snapshot.assets.find((asset) => {
          if (operation.isin && asset.isin?.toUpperCase() === operation.isin) return true;
          return Boolean(operation.ticker) && tickerKey(asset.ticker) === tickerKey(operation.ticker);
        });
        snapshot.operations.push(toFinancialOperation(operation, plan.currency, related));
        summary.operationsImported++;
      }
      if (selection.updateCostBasis) {
        for (const holding of snapshot.assets) {
          if (holding.ticker && updateHolding(holding, holding.currency, plan.currency, positions)) summary.holdingsUpdated++;
        }
      }
    }
    summary.operationsWithoutMonth = selection.recordOperations
      ? plan.operations.filter((operation) => !findSnapshot(data, operation.date)).length
      : 0;
    for (const snapshot of snapshots) snapshot.operations.sort((a, b) => a.date.localeCompare(b.date));
    result.netWorth = data;
  } else if (selection.recordOperations) {
    summary.operationsWithoutMonth = plan.operations.length;
  }

  if (selection.updateCostBasis && current.assets?.length) {
    const positions = new Map<string, Position>();
    for (const operation of plan.operations) applyToPositions(positions, operation);
    const assets = structuredClone(current.assets);
    for (const asset of assets) {
      if (updateHolding(asset, asset.originalCurrency ?? plan.currency, plan.currency, positions)) summary.allocationAssetsUpdated++;
    }
    if (summary.allocationAssetsUpdated > 0) result.assets = assets;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export const OPERATIONS_TEMPLATE_FILENAME = 'fire-tools-investment-operations.xlsx';
const HEADERS = ['Date', 'Action', 'Name', 'Ticker', 'ISIN', 'Quantity', 'Price', 'Fee', 'Amount', 'Currency', 'FX rate', 'Broker', 'Exchange', 'Notes'];
const WIDTHS = [12, 10, 34, 12, 14, 10, 10, 8, 10, 10, 9, 14, 10, 30];

/** The copy-ready prompt: everything after the first horizontal rule. */
export function getOperationsAgentPrompt(): string {
  const parts = promptDocument.split(/\r?\n---\r?\n/);
  return (parts.length > 1 ? parts.slice(1).join('\n---\n') : promptDocument).trim();
}

function header(values: string[]): XlsxWriteValue[] {
  return values.map((value) => ({ value, style: 'header' as const }));
}

export function buildOperationsTemplate(options: { currency: SupportedCurrency }): Uint8Array {
  const { currency } = options;
  const readme: XlsxWriteValue[][] = [
    [{ value: 'Fire Tools investment operations', style: 'title' }],
    ['Import it in Fire Tools: Net Worth Tracker > Data Management > Import operations (XLSX), or Settings > Data.'],
    [],
    [{ value: 'How to fill it', style: 'section' }],
    ['1. One row per operation on the Operations sheet. README and Example are ignored.'],
    ['2. Date: YYYY-MM-DD (or a spreadsheet date). Action: BUY, SELL, DIVIDEND, FEE, TAX or TRANSFER.'],
    ['3. BUY/SELL: Quantity and Price per unit; Fee is the broker fee. DIVIDEND/FEE/TAX: put the total in Amount.'],
    ['4. Amount is optional for trades; when filled it is used instead of Quantity x Price.'],
    [`5. Currency of the price. FX rate (optional) = ${currency} per 1 unit of that currency on the trade date.`],
    ['6. Ticker (Yahoo Finance symbol) or ISIN links operations to your holdings and their average cost.'],
    ['7. Operations are recorded in Net Worth months that already exist; import or log those months first.'],
    [],
    [{ value: 'Using an AI assistant', style: 'section' }],
    ['Copy the prompt below into your assistant together with your broker statements or trade confirmations.'],
    [],
    ...getOperationsAgentPrompt().split(/\r?\n/).map((line) => [line ? { value: line, style: 'muted' as const } : null]),
  ];
  const validations = [
    { range: 'B2:B2000', source: '"BUY,SELL,DIVIDEND,FEE,TAX,TRANSFER"' },
    { range: 'J2:J2000', source: `"${SUPPORTED_CURRENCIES.map((item) => item.code).join(',')}"` },
  ];
  const sheet = (name: string, rows: XlsxWriteValue[][]): XlsxWriteSheet => ({
    name, rows: [header(HEADERS), ...rows], columnWidths: WIDTHS, freezeRows: 1, listValidations: validations,
  });
  const example: XlsxWriteValue[][] = [
    ['2024-01-15', 'BUY', 'Global equity ETF', 'DEMO-GLB', 'XX0000000001', 10, 95.4, 1.25, null, 'EUR', null, 'Example Broker', 'AMS', 'Fictional example'],
    ['2024-03-04', 'BUY', 'Example Corp', 'DEMO-CORP', 'XX0000000002', 5, 182.1, 1, null, 'USD', 0.92, 'Example Broker', 'NASDAQ'],
    ['2024-06-20', 'DIVIDEND', 'Example Corp', 'DEMO-CORP', 'XX0000000002', null, null, null, 4.1, 'USD', 0.93, 'Example Broker'],
    ['2024-09-02', 'SELL', 'Global equity ETF', 'DEMO-GLB', 'XX0000000001', 4, 101.7, 1.25, null, 'EUR', null, 'Example Broker', 'AMS'],
    ['2024-12-31', 'FEE', 'Account fee', null, null, null, null, null, 3, 'EUR', null, 'Example Broker'],
  ];
  return writeXlsxWorkbook([
    { name: 'README', rows: readme, columnWidths: [100] },
    sheet('Example', example),
    sheet('Operations', []),
  ]);
}

export function downloadOperationsTemplate(options: { currency: SupportedCurrency }): void {
  const bytes = buildOperationsTemplate(options);
  downloadFile(new Blob([new Uint8Array(bytes)], { type: XLSX_MIME_TYPE }), OPERATIONS_TEMPLATE_FILENAME, XLSX_MIME_TYPE);
}
