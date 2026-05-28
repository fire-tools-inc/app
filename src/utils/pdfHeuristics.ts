/**
 * Heuristic parsers for the experimental PDF expense/income import feature.
 *
 * Pure functions over already-extracted PDF text. Each parser is conservative
 * and emits a confidence score; low-confidence rows are surfaced to the user
 * in the review dialog so they can fix or exclude them.
 */

import { SupportedCurrency } from '../types/currency';
import {
  ExpenseCategory,
  ExpenseType,
  IncomeSource,
} from '../types/expenseTracker';
import {
  ParsedTransactionDraft,
  PdfDocType,
} from '../types/pdfImport';
import type { ExtractedPdf } from './pdfTextExtractor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, gen: 1, gennaio: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febbraio: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, aprile: 4, abr: 4, abril: 4,
  may: 5, mag: 5, maggio: 5, mayo: 5, mai: 5,
  jun: 6, june: 6, giu: 6, giugno: 6, junio: 6, juin: 6,
  jul: 7, july: 7, lug: 7, luglio: 7, jul_es: 7, julio: 7, juil: 7,
  aug: 8, august: 8, ago: 8, agosto: 8, aoû: 8, août: 8,
  sep: 9, sept: 9, september: 9, set: 9, settembre: 9, septembre: 9, septiembre: 9, sept_es: 9,
  oct: 10, october: 10, ott: 10, ottobre: 10, octubre: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, dicembre: 12, diciembre: 12, déc: 12, decembre: 12,
};

const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DMY_DATE_RE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/;
const TEXT_DATE_RE = /\b(\d{1,2})\s+([A-Za-zàâéèêëîïôûüçñ]+)\.?\s+(\d{2,4})\b/;

/** Parse a date string in many common formats. Returns ISO YYYY-MM-DD or null. */
export function parseDate(input: string, prefer: 'dmy' | 'mdy' = 'dmy'): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  const iso = trimmed.match(ISO_DATE_RE);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (isValidYmd(y, m, d)) return formatYmd(y, m, d);
  }

  const dmy = trimmed.match(DMY_DATE_RE);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    // Prefer DMY by default, but if first part > 12 it must be DMY,
    // if second part > 12 it must be MDY.
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else if (prefer === 'mdy') {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (isValidYmd(y, month, day)) return formatYmd(y, month, day);
  }

  const text = trimmed.match(TEXT_DATE_RE);
  if (text) {
    const day = Number(text[1]);
    const monthName = text[2].toLowerCase();
    let y = Number(text[3]);
    if (y < 100) y += 2000;
    const month = MONTHS[monthName] ?? MONTHS[monthName.slice(0, 3)];
    if (month && isValidYmd(y, month, day)) return formatYmd(y, month, day);
  }

  return null;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const AMOUNT_TOKEN_RE = /-?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})|-?\d+(?:[.,]\d{1,2})|-?\d+/g;

/**
 * Parse an amount string in EU (1.234,56) or US (1,234.56) format.
 * Returns null if no numeric value can be parsed.
 */
export function parseAmount(input: string): number | null {
  if (!input) return null;
  const stripped = input.replace(/[€$£¥]|EUR|USD|GBP|CHF|JPY|AUD|CAD/gi, '').trim();
  // Find the rightmost number-like token to handle "Total: 1.234,56".
  const matches = stripped.match(AMOUNT_TOKEN_RE);
  if (!matches || matches.length === 0) return null;
  const raw = matches[matches.length - 1];
  return parseNumberToken(raw);
}

function parseNumberToken(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    // Comma is decimal separator (EU format)
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Dot is decimal separator (US format)
    normalized = cleaned.replace(/,/g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const CURRENCY_SYMBOL_MAP: Record<string, SupportedCurrency> = {
  '€': 'EUR',
  '$': 'USD',
  '£': 'GBP',
  '¥': 'JPY',
};

const CURRENCY_CODE_RE = /\b(EUR|USD|GBP|CHF|JPY|AUD|CAD)\b/;

export function detectCurrency(text: string): SupportedCurrency | undefined {
  const code = text.match(CURRENCY_CODE_RE);
  if (code) return code[1] as SupportedCurrency;
  for (const [sym, cur] of Object.entries(CURRENCY_SYMBOL_MAP)) {
    if (text.includes(sym)) return cur;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Doc-type detection
// ---------------------------------------------------------------------------

const PAYSLIP_KEYWORDS = [
  'payslip', 'pay slip', 'pay statement', 'wage slip', 'salary slip',
  'net pay', 'gross pay', 'employer', 'employee', 'pay period',
  'busta paga', 'cedolino', 'stipendio netto', 'retribuzione',
  'fiche de paie', 'bulletin de paie', 'salaire net',
  'nomina', 'sueldo neto',
];
const INVOICE_KEYWORDS = [
  'invoice', 'invoice number', 'invoice no', 'invoice date',
  'fattura', 'numero fattura', 'partita iva',
  'facture', 'facture n', 'numéro de facture',
  'factura', 'factura n', 'número de factura',
];
const RECEIPT_KEYWORDS = [
  'receipt', 'thank you for your purchase', 'thank you for shopping',
  'scontrino', 'ricevuta',
  'reçu', 'ticket de caisse',
  'recibo',
];
const STATEMENT_KEYWORDS = [
  'account statement', 'statement of account', 'transaction history',
  'opening balance', 'closing balance', 'available balance',
  'estratto conto', 'movimenti', 'saldo iniziale', 'saldo finale',
  'relevé de compte', 'solde initial', 'solde final',
  'extracto de cuenta', 'saldo inicial', 'saldo final',
];

export function autoDetectDocType(text: string): Exclude<PdfDocType, 'auto'> {
  const lower = text.toLowerCase();
  const scores: Record<Exclude<PdfDocType, 'auto'>, number> = {
    payslip: countKeywords(lower, PAYSLIP_KEYWORDS),
    invoice: countKeywords(lower, INVOICE_KEYWORDS),
    receipt: countKeywords(lower, RECEIPT_KEYWORDS),
    bank_statement: countKeywords(lower, STATEMENT_KEYWORDS),
  };
  let best: Exclude<PdfDocType, 'auto'> = 'receipt';
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores) as [Exclude<PdfDocType, 'auto'>, number][]) {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  // Heuristic fallback: if we cannot identify any keywords, try to detect
  // a bank statement by row density (many lines starting with a date).
  if (bestScore === 0) {
    let dateRowCount = 0;
    for (const line of text.split('\n')) {
      if (/^\s*(?:\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/.test(line)) {
        dateRowCount++;
      }
    }
    if (dateRowCount >= 3) return 'bank_statement';
  }
  return best;
}

function countKeywords(text: string, keywords: string[]): number {
  let n = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Category heuristics
// ---------------------------------------------------------------------------

interface CategoryRule {
  category: ExpenseCategory;
  expenseType: ExpenseType;
  patterns: RegExp[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'GROCERIES',
    expenseType: 'NEED',
    patterns: [/supermarket|grocer|esselunga|coop|carrefour|lidl|aldi|tesco|sainsbury|whole\s*foods|trader\s*joe|kroger|walmart|conad|pam|penny|eurospin/i],
  },
  {
    category: 'DINING_OUT',
    expenseType: 'WANT',
    patterns: [/restaurant|ristorante|pizzeria|trattoria|osteria|pub|bar\b|caf[ée]|starbucks|mcdonald|burger|kfc|subway|dining|deliveroo|uber\s*eats|just\s*eat/i],
  },
  {
    category: 'TRANSPORTATION',
    expenseType: 'NEED',
    patterns: [/uber|lyft|taxi|cab\b|metro|subway\s*card|train|trenitalia|italo|sncf|renfe|bus|tram|gasoline|fuel|benzina|gas\s*station|petrol|shell|eni|q8|esso|tamoil|agip|bp\b|texaco|chevron|exxon/i],
  },
  {
    category: 'UTILITIES',
    expenseType: 'NEED',
    patterns: [/electric(?:ity)?|power\s*bill|gas\s*bill|water\s*bill|utility|utilities|enel|iren|hera|a2a|edf|engie|british\s*gas|comcast|verizon|wifi|broadband|internet\s*bill/i],
  },
  {
    category: 'HOUSING',
    expenseType: 'NEED',
    patterns: [/rent\b|mortgage|landlord|affitto|mutuo|hoa\s*fee|condominio|loyer/i],
  },
  {
    category: 'HEALTHCARE',
    expenseType: 'NEED',
    patterns: [/pharmacy|farmacia|drugstore|hospital|ospedale|clinic|clinica|doctor|medico|dentist|dentista|optician|ottico/i],
  },
  {
    category: 'INSURANCE',
    expenseType: 'NEED',
    patterns: [/insurance|assicurazione|allianz|axa|generali|unipol|geico|state\s*farm/i],
  },
  {
    category: 'SUBSCRIPTIONS',
    expenseType: 'WANT',
    patterns: [/netflix|spotify|amazon\s*prime|disney\+?|apple\s*music|apple\s*tv|youtube\s*premium|github|microsoft\s*365|adobe|dropbox|icloud|google\s*one/i],
  },
  {
    category: 'ENTERTAINMENT',
    expenseType: 'WANT',
    patterns: [/cinema|theater|theatre|concert|spotify|playstation|xbox|nintendo|steam|gog\.com|epic\s*games/i],
  },
  {
    category: 'SHOPPING',
    expenseType: 'WANT',
    patterns: [/amazon\.|ebay|zalando|asos|h&m|zara|ikea|decathlon|nike|adidas|apple\s*store/i],
  },
  {
    category: 'TRAVEL',
    expenseType: 'WANT',
    patterns: [/airbnb|booking\.com|hotel|albergo|hostel|airlines?|ryanair|easyjet|lufthansa|delta|united|british\s*airways/i],
  },
  {
    category: 'PERSONAL_CARE',
    expenseType: 'WANT',
    patterns: [/barber|hairdress|parruccher|salon|spa\b|massage|cosmetic|sephora|douglas/i],
  },
  {
    category: 'EDUCATION',
    expenseType: 'NEED',
    patterns: [/tuition|school\s*fees|università|university|college|udemy|coursera|edx|book\s*store|libreria/i],
  },
  {
    category: 'FEES',
    expenseType: 'NEED',
    patterns: [/bank\s*fee|service\s*charge|atm\s*fee|interest\s*charge|commission|commissione/i],
  },
];

export function categorizeExpense(description: string): {
  category: ExpenseCategory;
  expenseType: ExpenseType;
} {
  for (const rule of CATEGORY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(description)) {
        return { category: rule.category, expenseType: rule.expenseType };
      }
    }
  }
  return { category: 'NO_CATEGORY', expenseType: 'WANT' };
}

// ---------------------------------------------------------------------------
// Total / amount extraction
// ---------------------------------------------------------------------------

const TOTAL_LABELS_RE = /^(?:grand\s*total|total\s*amount|amount\s*due|amount\s*paid|total\s*due|total|totale|totale\s*complessivo|importo\s*totale|importo\s*dovuto|montant\s*total|total\s*à\s*payer|importe\s*total|gesamt|gesamtbetrag|summe)\b/i;

/** Find the most likely total line in a receipt/invoice. */
function findTotalAmount(lines: string[]): { amount: number; rawLine: string } | null {
  let best: { amount: number; rawLine: string; score: number } | null = null;

  for (const line of lines) {
    const labelMatch = line.match(TOTAL_LABELS_RE);
    if (!labelMatch) continue;
    const amount = parseAmount(line);
    if (amount === null) continue;
    // Prefer "grand total" / "total amount" over plain "total".
    const score =
      /grand\s*total|total\s*amount|importo\s*totale|gesamtbetrag/i.test(line) ? 3 :
      /total|totale|importo|montant\s*total|importe\s*total/i.test(line) ? 2 : 1;
    if (!best || score > best.score) {
      best = { amount: Math.abs(amount), rawLine: line, score };
    }
  }

  if (best) return { amount: best.amount, rawLine: best.rawLine };
  return null;
}

function findFirstDate(text: string): string | null {
  for (const line of text.split('\n')) {
    const d = parseDate(line);
    if (d) return d;
  }
  return null;
}

function deriveDescription(extracted: ExtractedPdf, fallback: string): string {
  // Use the first non-trivial line as a description (typically the merchant
  // or company name).
  for (const line of extracted.lines) {
    const t = line.text.trim();
    if (t.length >= 3 && !/^[\d\s\W]+$/.test(t)) {
      return t.slice(0, 120);
    }
  }
  return fallback;
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `pdf-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Per-doc-type parsers
// ---------------------------------------------------------------------------

export function parseReceipt(
  extracted: ExtractedPdf,
  fallbackCurrency?: SupportedCurrency,
): ParsedTransactionDraft[] {
  const lines = extracted.lines.map(l => l.text);
  const total = findTotalAmount(lines);
  if (!total) return [];

  const date = findFirstDate(extracted.fullText) ?? '';
  const description = deriveDescription(extracted, extracted.fileName.replace(/\.pdf$/i, ''));
  const currency = detectCurrency(extracted.fullText) ?? fallbackCurrency;
  const category = categorizeExpense(description);

  return [{
    id: genId(),
    kind: 'expense',
    date,
    amount: total.amount,
    currency,
    description,
    suggestedCategory: category.category,
    suggestedExpenseType: category.expenseType,
    docType: 'receipt',
    sourceFile: extracted.fileName,
    rawLine: total.rawLine,
    include: true,
    confidence: date ? 0.75 : 0.55,
  }];
}

export function parseInvoice(
  extracted: ExtractedPdf,
  fallbackCurrency?: SupportedCurrency,
): ParsedTransactionDraft[] {
  const lines = extracted.lines.map(l => l.text);
  const total = findTotalAmount(lines);
  if (!total) return [];

  const date = findFirstDate(extracted.fullText) ?? '';
  const description = deriveDescription(extracted, 'Invoice');
  const currency = detectCurrency(extracted.fullText) ?? fallbackCurrency;
  const category = categorizeExpense(description);

  return [{
    id: genId(),
    kind: 'expense',
    date,
    amount: total.amount,
    currency,
    description,
    suggestedCategory: category.category,
    suggestedExpenseType: category.expenseType,
    docType: 'invoice',
    sourceFile: extracted.fileName,
    rawLine: total.rawLine,
    include: true,
    confidence: date ? 0.7 : 0.5,
  }];
}

const NET_PAY_LABELS_RE = /(total\s*net\s*pay(?:ment)?|net\s*pay(?:ment)?|net\s*amount|net\s*salary|take[\-\s]*home(?:\s*pay)?|net\s*income|netto\s*a\s*pagare|stipendio\s*netto|importo\s*netto|salaire\s*net|sueldo\s*neto|nettolohn|netto\s*lohn)/i;

export function parsePayslip(
  extracted: ExtractedPdf,
  fallbackCurrency?: SupportedCurrency,
): ParsedTransactionDraft[] {
  const lines = extracted.lines.map(l => l.text);

  let netLine: string | null = null;
  let netAmount: number | null = null;
  let labelOnlyMatch = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!NET_PAY_LABELS_RE.test(line)) continue;
    // First try: amount on the same line.
    const same = parseAmount(line);
    if (same !== null) {
      netLine = line;
      netAmount = same;
      if (Math.abs(same) > 0.001) break;
    }
    // Fallback: scan the next few lines for an amount.
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const candidate = parseAmount(lines[j]);
      if (candidate !== null) {
        netLine = `${line} → ${lines[j]}`;
        netAmount = candidate;
        labelOnlyMatch = true;
        if (Math.abs(candidate) > 0.001) break;
      }
    }
    if (netAmount !== null && Math.abs(netAmount) > 0.001) break;
  }

  if (netAmount === null) return [];

  const isZero = Math.abs(netAmount) < 0.001;
  const date = findFirstDate(extracted.fullText) ?? '';
  const description = deriveDescription(extracted, 'Salary');
  const currency = detectCurrency(extracted.fullText) ?? fallbackCurrency;

  // Templates often have only zero placeholders. Surface them as a low-
  // confidence, opt-out-by-default draft so the user knows what we found
  // and can either fill the amount in or skip the row.
  return [{
    id: genId(),
    kind: 'income',
    date,
    amount: Math.abs(netAmount),
    currency,
    description: isZero ? `${description} (template?)` : description,
    suggestedIncomeSource: 'SALARY' as IncomeSource,
    docType: 'payslip',
    sourceFile: extracted.fileName,
    rawLine: netLine ?? undefined,
    include: !isZero,
    confidence: isZero ? 0.1 : (labelOnlyMatch ? 0.6 : (date ? 0.8 : 0.6)),
  }];
}

// Bank statement row regex: optional date at start, description, then one or two amounts at end.
// We require at least one date and one amount on the same line.
const ROW_DATE_RE = /^(?:\s*)(\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-zàâéèêëîïôûüçñ]+\.?\s+\d{2,4})\b/;

export function parseBankStatement(
  extracted: ExtractedPdf,
  fallbackCurrency?: SupportedCurrency,
): ParsedTransactionDraft[] {
  const drafts: ParsedTransactionDraft[] = [];
  const currency = detectCurrency(extracted.fullText) ?? fallbackCurrency;
  // Determine the statement year from headers when only DD/MM (no year) is present.
  const headerYearMatch = extracted.fullText.match(/\b(20\d{2})\b/);
  const headerYear = headerYearMatch ? Number(headerYearMatch[1]) : new Date().getFullYear();

  for (const line of extracted.lines) {
    const text = line.text;
    const dateMatch = text.match(ROW_DATE_RE);
    if (!dateMatch) continue;

    let date = parseDate(dateMatch[1]);
    if (!date) {
      // Try with the inferred header year for short dates.
      const short = dateMatch[1].match(/^(\d{1,2})[\/.\-](\d{1,2})$/);
      if (short) {
        const d = Number(short[1]);
        const m = Number(short[2]);
        if (isValidYmd(headerYear, m, d)) date = formatYmd(headerYear, m, d);
      }
    }
    if (!date) continue;

    // Extract all amount-like tokens.
    const amountTokens = text.match(/-?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})|-?\d+(?:[.,]\d{1,2})/g);
    if (!amountTokens || amountTokens.length === 0) continue;
    // Skip the date itself if it looked like a number.
    const numericCandidates = amountTokens
      .map(t => ({ raw: t, value: parseNumberToken(t) }))
      .filter(c => c.value !== null && Math.abs(c.value!) >= 0.01);
    if (numericCandidates.length === 0) continue;
    // Use the last numeric token on the line as the transaction amount.
    const last = numericCandidates[numericCandidates.length - 1];
    const amount = last.value!;

    // Description = the part of the line between the date and the amount.
    const dateEnd = (text.indexOf(dateMatch[1]) + dateMatch[1].length);
    const amountStart = text.lastIndexOf(last.raw);
    let description = text.slice(dateEnd, amountStart).trim();
    if (!description) description = text.trim();
    description = description.replace(/\s+/g, ' ').slice(0, 120);

    // Heuristic: negative amount = expense, positive = income.
    const kind: 'income' | 'expense' = amount < 0 ? 'expense' : 'income';
    // Some statements present expenses in a debit column without a minus sign;
    // we infer this by keyword.
    const debitHint = /debit|addebito|prelievo|pagamento|spesa|withdraw/i.test(description);
    const creditHint = /credit|accredito|stipendio|salary|bonifico\s*in|deposit/i.test(description);

    let finalKind: 'income' | 'expense' = kind;
    if (amount > 0 && debitHint && !creditHint) finalKind = 'expense';
    if (amount < 0 && creditHint && !debitHint) finalKind = 'income';

    const absAmount = Math.abs(amount);
    let suggestedCategory: ExpenseCategory | undefined;
    let suggestedExpenseType: ExpenseType | undefined;
    let suggestedIncomeSource: IncomeSource | undefined;
    if (finalKind === 'expense') {
      const cat = categorizeExpense(description);
      suggestedCategory = cat.category;
      suggestedExpenseType = cat.expenseType;
    } else if (/salary|stipendio|payroll/i.test(description)) {
      suggestedIncomeSource = 'SALARY';
    } else if (/dividend|interest|investment|cedola/i.test(description)) {
      suggestedIncomeSource = 'INVESTMENTS';
    } else if (/rent\s*income|affitto\s*incassato/i.test(description)) {
      suggestedIncomeSource = 'RENTAL';
    } else {
      suggestedIncomeSource = 'OTHER';
    }

    drafts.push({
      id: genId(),
      kind: finalKind,
      date,
      amount: absAmount,
      currency,
      description,
      suggestedCategory,
      suggestedExpenseType,
      suggestedIncomeSource,
      docType: 'bank_statement',
      sourceFile: extracted.fileName,
      rawLine: text,
      include: true,
      confidence: 0.65,
    });
  }

  return drafts;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function parsePdf(
  extracted: ExtractedPdf,
  docType: PdfDocType,
  fallbackCurrency?: SupportedCurrency,
): { drafts: ParsedTransactionDraft[]; resolvedDocType: Exclude<PdfDocType, 'auto'> } {
  const resolved: Exclude<PdfDocType, 'auto'> =
    docType === 'auto' ? autoDetectDocType(extracted.fullText) : docType;

  switch (resolved) {
    case 'receipt':
      return { drafts: parseReceipt(extracted, fallbackCurrency), resolvedDocType: resolved };
    case 'invoice':
      return { drafts: parseInvoice(extracted, fallbackCurrency), resolvedDocType: resolved };
    case 'payslip':
      return { drafts: parsePayslip(extracted, fallbackCurrency), resolvedDocType: resolved };
    case 'bank_statement':
      return { drafts: parseBankStatement(extracted, fallbackCurrency), resolvedDocType: resolved };
  }
}
