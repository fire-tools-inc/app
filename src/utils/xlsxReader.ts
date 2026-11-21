/**
 * Minimal, dependency-light XLSX (Office Open XML) reader.
 *
 * Reads sheet names, cached cell values and formulas. Formulas are never
 * evaluated: imports rely on the values cached by the authoring application
 * (Excel, LibreOffice, Google Sheets, Numbers).
 */

import { unzipSync, strFromU8 } from 'fflate';

export type XlsxCellValue = string | number | boolean | null;

export interface XlsxCell {
  value: XlsxCellValue;
  /** Formula text without the leading '=' (shared formulas are expanded). */
  formula?: string;
}

export interface XlsxSheet {
  name: string;
  /** 1-based row -> 1-based column -> cell */
  rows: Map<number, Map<number, XlsxCell>>;
  maxRow: number;
  maxColumn: number;
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
  /** True when the workbook stores dates using the 1904 date system. */
  date1904: boolean;
}

export type XlsxReadErrorCode = 'notXlsx' | 'tooLarge' | 'invalid';

export class XlsxReadError extends Error {
  constructor(readonly code: XlsxReadErrorCode, message: string) {
    super(message);
    this.name = 'XlsxReadError';
  }
}

/** Upper bound for the decompressed XML parts read from one workbook. */
export const MAX_XLSX_UNCOMPRESSED_BYTES = 96 * 1024 * 1024;
const MAX_COLUMN = 16384;

const RELATIONSHIP_NS_TYPES = {
  officeDocument: /\/officeDocument$/,
  worksheet: /\/worksheet$/,
  sharedStrings: /\/sharedStrings$/,
};

export function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index;
}

export function columnIndexToLetters(index: number): string {
  let letters = '';
  let remaining = index;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letters;
}

export function parseCellReference(reference: string): { row: number; column: number } | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(reference.trim());
  if (!match) return null;
  const column = columnLettersToIndex(match[1]);
  const row = Number(match[2]);
  if (column < 1 || column > MAX_COLUMN || row < 1) return null;
  return { row, column };
}

/**
 * Matches A1 references outside string literals. The look-arounds skip
 * function names such as LOG10( and sheet names such as AB1!A1.
 */
const A1_REFERENCE = /(?<![A-Za-z0-9_.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_!])/g;

/** Apply a callback to every A1 reference outside quoted string literals. */
export function mapFormulaReferences(
  formula: string,
  replacer: (ref: { columnAbsolute: boolean; column: number; rowAbsolute: boolean; row: number }) => string,
): string {
  return formula
    .split('"')
    .map((segment, index) => (index % 2 === 1
      ? segment
      : segment.replace(A1_REFERENCE, (_match, colAbs: string, letters: string, rowAbs: string, digits: string) => replacer({
        columnAbsolute: colAbs === '$',
        column: columnLettersToIndex(letters),
        rowAbsolute: rowAbs === '$',
        row: Number(digits),
      }))))
    .join('"');
}

/** Translate a shared formula from its anchor cell to another cell. */
export function shiftFormula(formula: string, rowOffset: number, columnOffset: number): string {
  if (rowOffset === 0 && columnOffset === 0) return formula;
  return mapFormulaReferences(formula, ({ columnAbsolute, column, rowAbsolute, row }) => {
    const nextColumn = columnAbsolute ? column : column + columnOffset;
    const nextRow = rowAbsolute ? row : row + rowOffset;
    if (nextColumn < 1 || nextRow < 1) return '#REF!';
    return `${columnAbsolute ? '$' : ''}${columnIndexToLetters(nextColumn)}${rowAbsolute ? '$' : ''}${nextRow}`;
  });
}

function parseXml(xml: string, part: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new XlsxReadError('invalid', `Workbook part ${part} is not valid XML`);
  }
  return doc;
}

function elements(parent: Document | Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', localName));
}

function childElements(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

function relationshipId(element: Element): string | null {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === 'id' && attribute.prefix) return attribute.value;
  }
  return null;
}

function resolvePartPath(baseDir: string, target: string): string {
  const raw = target.startsWith('/') ? target.slice(1) : `${baseDir}${target}`;
  const segments: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '..') segments.pop();
    else if (segment !== '.' && segment !== '') segments.push(segment);
  }
  return segments.join('/');
}

function readRelationships(files: Record<string, Uint8Array>, path: string, baseDir: string): Array<{ id: string; type: string; target: string }> {
  const data = files[path];
  if (!data) return [];
  const doc = parseXml(strFromU8(data), path);
  return elements(doc, 'Relationship').map((rel) => ({
    id: rel.getAttribute('Id') ?? '',
    type: rel.getAttribute('Type') ?? '',
    target: resolvePartPath(baseDir, rel.getAttribute('Target') ?? ''),
  }));
}

/** Concatenate text runs, ignoring phonetic hints. */
function stringItemText(item: Element): string {
  return elements(item, 't')
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('');
}

interface SharedFormula {
  text: string;
  row: number;
  column: number;
}

function parseSheet(name: string, xml: string, part: string, sharedStrings: string[]): XlsxSheet {
  const doc = parseXml(xml, part);
  const rows = new Map<number, Map<number, XlsxCell>>();
  const sharedFormulas = new Map<string, SharedFormula>();
  let maxRow = 0;
  let maxColumn = 0;
  let implicitRow = 0;

  for (const rowElement of elements(doc, 'row')) {
    const rowNumber = Number(rowElement.getAttribute('r')) || implicitRow + 1;
    implicitRow = rowNumber;
    let implicitColumn = 0;
    for (const cellElement of childElements(rowElement, 'c')) {
      const reference = cellElement.getAttribute('r');
      const parsed = reference ? parseCellReference(reference) : null;
      const row = parsed?.row ?? rowNumber;
      const column = parsed?.column ?? implicitColumn + 1;
      implicitColumn = column;

      const type = cellElement.getAttribute('t') ?? 'n';
      const valueText = childElements(cellElement, 'v')[0]?.textContent ?? null;
      let value: XlsxCellValue = null;
      switch (type) {
        case 's': {
          const index = valueText === null ? NaN : Number(valueText);
          value = Number.isInteger(index) ? sharedStrings[index] ?? null : null;
          break;
        }
        case 'inlineStr': {
          const inline = childElements(cellElement, 'is')[0];
          value = inline ? stringItemText(inline) : null;
          break;
        }
        case 'str':
        case 'd':
          value = valueText;
          break;
        case 'b':
          value = valueText === null ? null : valueText === '1' || valueText.toLowerCase() === 'true';
          break;
        case 'e':
          value = null;
          break;
        default: {
          if (valueText !== null && valueText.trim() !== '') {
            const numeric = Number(valueText);
            value = Number.isFinite(numeric) ? numeric : null;
          }
        }
      }

      let formula: string | undefined;
      const formulaElement = childElements(cellElement, 'f')[0];
      if (formulaElement) {
        const text = (formulaElement.textContent ?? '').trim();
        const sharedIndex = formulaElement.getAttribute('si');
        if (formulaElement.getAttribute('t') === 'shared' && sharedIndex !== null) {
          if (text) {
            sharedFormulas.set(sharedIndex, { text, row, column });
            formula = text;
          } else {
            const anchor = sharedFormulas.get(sharedIndex);
            if (anchor) formula = shiftFormula(anchor.text, row - anchor.row, column - anchor.column);
          }
        } else if (text) {
          formula = text;
        }
      }

      if (value === null && formula === undefined) continue;
      let rowCells = rows.get(row);
      if (!rowCells) {
        rowCells = new Map();
        rows.set(row, rowCells);
      }
      rowCells.set(column, formula === undefined ? { value } : { value, formula });
      maxRow = Math.max(maxRow, row);
      maxColumn = Math.max(maxColumn, column);
    }
  }

  return { name, rows, maxRow, maxColumn };
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Parse an .xlsx file. Throws XlsxReadError for non-XLSX input, oversized
 * archives or malformed workbook parts.
 */
export function readXlsxWorkbook(bytes: Uint8Array): XlsxWorkbook {
  if (!isZip(bytes)) {
    throw new XlsxReadError('notXlsx', 'File is not an .xlsx workbook');
  }

  let totalBytes = 0;
  let oversized = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        const wanted = /\.(xml|rels)$/i.test(file.name)
          && !/^xl\/(media|drawings|charts|theme|threadedComments|persons|documenttasks|printerSettings)\//i.test(file.name);
        if (!wanted) return false;
        totalBytes += file.originalSize;
        if (totalBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
          oversized = true;
          return false;
        }
        return true;
      },
    });
  } catch (error) {
    throw new XlsxReadError('invalid', `Workbook archive could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (oversized) {
    throw new XlsxReadError('tooLarge', 'Workbook is too large to import');
  }

  const rootRelationships = readRelationships(files, '_rels/.rels', '');
  const workbookPath = rootRelationships.find((rel) => RELATIONSHIP_NS_TYPES.officeDocument.test(rel.type))?.target
    ?? 'xl/workbook.xml';
  const workbookData = files[workbookPath];
  if (!workbookData) {
    throw new XlsxReadError('notXlsx', 'Workbook part is missing');
  }

  const workbookDir = workbookPath.includes('/') ? workbookPath.slice(0, workbookPath.lastIndexOf('/') + 1) : '';
  const relsPath = `${workbookDir}_rels/${workbookPath.slice(workbookDir.length)}.rels`;
  const workbookRelationships = readRelationships(files, relsPath, workbookDir);
  const workbookDoc = parseXml(strFromU8(workbookData), workbookPath);

  const sharedStringsPath = workbookRelationships.find((rel) => RELATIONSHIP_NS_TYPES.sharedStrings.test(rel.type))?.target;
  const sharedStrings = sharedStringsPath && files[sharedStringsPath]
    ? elements(parseXml(strFromU8(files[sharedStringsPath]), sharedStringsPath), 'si').map(stringItemText)
    : [];

  const workbookProperties = elements(workbookDoc, 'workbookPr')[0];
  const date1904Attr = workbookProperties?.getAttribute('date1904');
  const date1904 = date1904Attr === '1' || date1904Attr === 'true';

  const sheets: XlsxSheet[] = [];
  for (const sheetElement of elements(workbookDoc, 'sheet')) {
    const name = sheetElement.getAttribute('name') ?? '';
    const id = relationshipId(sheetElement);
    const relation = workbookRelationships.find((rel) => rel.id === id && RELATIONSHIP_NS_TYPES.worksheet.test(rel.type));
    if (!relation) continue;
    const data = files[relation.target];
    if (!data) continue;
    sheets.push(parseSheet(name, strFromU8(data), relation.target, sharedStrings));
  }

  return { sheets, date1904 };
}

export function getCell(sheet: XlsxSheet, row: number, column: number): XlsxCell | undefined {
  return sheet.rows.get(row)?.get(column);
}

/** Convert a spreadsheet serial date to a UTC calendar date. */
export function serialToDate(serial: number, date1904 = false): { year: number; month: number; day: number } | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * 86_400_000);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
