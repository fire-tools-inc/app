import { describe, expect, it } from 'vitest';
import {
  autoDetectDocType,
  categorizeExpense,
  detectCurrency,
  parseAmount,
  parseBankStatement,
  parseDate,
  parseInvoice,
  parsePayslip,
  parsePdf,
  parseReceipt,
} from '../../src/utils/pdfHeuristics';
import type { ExtractedPdf, PdfTextLine } from '../../src/utils/pdfTextExtractor';

function makeExtracted(fileName: string, lines: string[]): ExtractedPdf {
  const textLines: PdfTextLine[] = lines.map((text, i) => ({ page: 1, y: 1000 - i, text }));
  return {
    fileName,
    fullText: lines.join('\n'),
    lines: textLines,
    pageCount: 1,
  };
}

describe('parseDate', () => {
  it('parses ISO dates', () => {
    expect(parseDate('2024-03-15')).toBe('2024-03-15');
  });

  it('parses DMY dates with slashes (default)', () => {
    expect(parseDate('15/03/2024')).toBe('2024-03-15');
  });

  it('parses DMY dates with dots', () => {
    expect(parseDate('15.03.2024')).toBe('2024-03-15');
  });

  it('parses MDY when configured', () => {
    expect(parseDate('03/15/2024', 'mdy')).toBe('2024-03-15');
  });

  it('detects DMY when day > 12 regardless of preference', () => {
    expect(parseDate('25/03/2024', 'mdy')).toBe('2024-03-25');
  });

  it('parses 2-digit years', () => {
    expect(parseDate('15/03/24')).toBe('2024-03-15');
  });

  it('parses textual English months', () => {
    expect(parseDate('15 March 2024')).toBe('2024-03-15');
  });

  it('parses textual Italian months', () => {
    expect(parseDate('15 marzo 2024')).toBe('2024-03-15');
  });

  it('returns null for invalid dates', () => {
    expect(parseDate('99/99/9999')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('parses EU format', () => {
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56);
  });

  it('parses US format', () => {
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56);
  });

  it('parses plain numbers', () => {
    expect(parseAmount('1234.56')).toBeCloseTo(1234.56);
    expect(parseAmount('1234,56')).toBeCloseTo(1234.56);
  });

  it('handles currency symbols and labels', () => {
    expect(parseAmount('Total: €1.234,56')).toBeCloseTo(1234.56);
    expect(parseAmount('$1,234.56 USD')).toBeCloseTo(1234.56);
  });

  it('handles negative amounts', () => {
    expect(parseAmount('-99,50')).toBeCloseTo(-99.5);
  });

  it('returns null for unparseable input', () => {
    expect(parseAmount('no numbers here')).toBeNull();
  });
});

describe('detectCurrency', () => {
  it('detects from ISO code', () => {
    expect(detectCurrency('Subtotal: 100 EUR')).toBe('EUR');
    expect(detectCurrency('Subtotal: 100 USD')).toBe('USD');
  });

  it('detects from symbol', () => {
    expect(detectCurrency('Total €123,45')).toBe('EUR');
    expect(detectCurrency('Total $123.45')).toBe('USD');
    expect(detectCurrency('Total £123.45')).toBe('GBP');
  });

  it('returns undefined when no signal', () => {
    expect(detectCurrency('1234.56')).toBeUndefined();
  });
});

describe('autoDetectDocType', () => {
  it('detects payslip from net pay keyword', () => {
    expect(autoDetectDocType('Pay statement\nGross pay: 3000\nNet pay: 2300')).toBe('payslip');
  });

  it('detects invoice from invoice number keyword', () => {
    expect(autoDetectDocType('INVOICE\nInvoice number: 42\nInvoice date: 2024-03-15')).toBe('invoice');
  });

  it('detects receipt', () => {
    expect(autoDetectDocType('Thank you for your purchase\nRECEIPT')).toBe('receipt');
  });

  it('detects bank statement', () => {
    expect(autoDetectDocType('Account Statement\nOpening balance 1000\nClosing balance 950')).toBe('bank_statement');
  });
});

describe('categorizeExpense', () => {
  it('classifies groceries', () => {
    expect(categorizeExpense('Esselunga SPA')).toEqual({ category: 'GROCERIES', expenseType: 'NEED' });
  });

  it('classifies dining out', () => {
    expect(categorizeExpense('Ristorante La Pergola')).toEqual({ category: 'DINING_OUT', expenseType: 'WANT' });
  });

  it('classifies transportation', () => {
    expect(categorizeExpense('Uber trip to airport')).toEqual({ category: 'TRANSPORTATION', expenseType: 'NEED' });
  });

  it('classifies subscriptions', () => {
    expect(categorizeExpense('Netflix monthly')).toEqual({ category: 'SUBSCRIPTIONS', expenseType: 'WANT' });
  });

  it('falls back to NO_CATEGORY', () => {
    expect(categorizeExpense('Some random merchant')).toEqual({ category: 'NO_CATEGORY', expenseType: 'WANT' });
  });
});

describe('parseReceipt', () => {
  it('extracts total + date + description', () => {
    const extracted = makeExtracted('grocery.pdf', [
      'ESSELUNGA SPA',
      'Via Roma 10, Milano',
      '15/03/2024 12:34',
      'Pasta 2,50',
      'Bread 1,80',
      'Tomatoes 3,20',
      'TOTAL €7,50',
    ]);
    const result = parseReceipt(extracted);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('expense');
    expect(result[0].amount).toBeCloseTo(7.5);
    expect(result[0].date).toBe('2024-03-15');
    expect(result[0].currency).toBe('EUR');
    expect(result[0].suggestedCategory).toBe('GROCERIES');
    expect(result[0].suggestedExpenseType).toBe('NEED');
  });

  it('returns empty when no total found', () => {
    const extracted = makeExtracted('blank.pdf', ['Some line', 'Another line']);
    expect(parseReceipt(extracted)).toHaveLength(0);
  });
});

describe('parseInvoice', () => {
  it('extracts grand total preferentially', () => {
    const extracted = makeExtracted('invoice.pdf', [
      'ACME Corp',
      'Invoice number: 42',
      'Invoice date: 2024-03-15',
      'Subtotal: 1000,00',
      'VAT: 220,00',
      'Grand total: €1.220,00',
    ]);
    const result = parseInvoice(extracted);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBeCloseTo(1220);
    expect(result[0].date).toBe('2024-03-15');
    expect(result[0].kind).toBe('expense');
  });
});

describe('parsePayslip', () => {
  it('extracts net pay as income', () => {
    const extracted = makeExtracted('payslip.pdf', [
      'ACME Inc - Payroll',
      'Pay period: March 2024',
      '15/03/2024',
      'Gross pay: 4000,00',
      'Taxes: -1200,00',
      'Net pay: 2.800,00 EUR',
    ]);
    const result = parsePayslip(extracted);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('income');
    expect(result[0].amount).toBeCloseTo(2800);
    expect(result[0].suggestedIncomeSource).toBe('SALARY');
    expect(result[0].currency).toBe('EUR');
  });

  it('extracts Italian "Importo netto"', () => {
    const extracted = makeExtracted('busta.pdf', [
      'Busta Paga - Marzo 2024',
      'Stipendio lordo: 4.000,00',
      'Importo netto: 2.500,00',
    ]);
    const result = parsePayslip(extracted);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBeCloseTo(2500);
  });

  it('returns empty when no net pay line is found', () => {
    const extracted = makeExtracted('nope.pdf', ['no payroll info here']);
    expect(parsePayslip(extracted)).toHaveLength(0);
  });
});

describe('parseBankStatement', () => {
  it('parses rows with signed amounts', () => {
    const extracted = makeExtracted('statement.pdf', [
      'Account statement 2024',
      'Opening balance: 1.000,00',
      '01/03/2024 Stipendio acme spa 2.500,00',
      '03/03/2024 Esselunga -45,30',
      '10/03/2024 Netflix -12,99',
      'Closing balance: 3.441,71',
    ]);
    const result = parseBankStatement(extracted);
    expect(result).toHaveLength(3);
    const [salary, groceries, netflix] = result;
    expect(salary.kind).toBe('income');
    expect(salary.amount).toBeCloseTo(2500);
    expect(salary.suggestedIncomeSource).toBe('SALARY');
    expect(groceries.kind).toBe('expense');
    expect(groceries.amount).toBeCloseTo(45.3);
    expect(groceries.suggestedCategory).toBe('GROCERIES');
    expect(netflix.suggestedCategory).toBe('SUBSCRIPTIONS');
  });

  it('uses keyword hints when amounts are unsigned', () => {
    const extracted = makeExtracted('statement.pdf', [
      'Statement 2024',
      '05/03/2024 Pagamento POS Esselunga 45,30',
      '20/03/2024 Bonifico in entrata stipendio 2500,00',
    ]);
    const result = parseBankStatement(extracted);
    expect(result.find(r => r.description.includes('Esselunga'))?.kind).toBe('expense');
    expect(result.find(r => r.description.includes('stipendio'))?.kind).toBe('income');
  });

  it('infers year from statement header for short dates', () => {
    const extracted = makeExtracted('s.pdf', [
      'Account statement 2023',
      '05/03 Coffee shop 4,50',
    ]);
    const result = parseBankStatement(extracted);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2023-03-05');
  });
});

describe('parsePdf dispatcher', () => {
  it('auto-detects and routes to the correct parser', () => {
    const extracted = makeExtracted('p.pdf', [
      'Pay statement March',
      'Net pay: 2000,00 USD',
      '15/03/2024',
    ]);
    const { drafts, resolvedDocType } = parsePdf(extracted, 'auto');
    expect(resolvedDocType).toBe('payslip');
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe('income');
  });

  it('honors explicit doc type', () => {
    const extracted = makeExtracted('r.pdf', [
      'Cafe Roma',
      '15/03/2024',
      'TOTAL €6,50',
    ]);
    const { resolvedDocType } = parsePdf(extracted, 'receipt');
    expect(resolvedDocType).toBe('receipt');
  });

  it('passes through fallback currency', () => {
    const extracted = makeExtracted('p.pdf', [
      'Cafe Roma',
      '15/03/2024',
      'TOTAL 6,50',
    ]);
    const { drafts } = parsePdf(extracted, 'receipt', 'GBP');
    expect(drafts[0].currency).toBe('GBP');
  });
});
