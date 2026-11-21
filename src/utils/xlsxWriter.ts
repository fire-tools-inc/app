/**
 * Minimal XLSX writer used for downloadable templates and test fixtures.
 * Produces a standards-compliant workbook with inline strings, optional
 * cached formulas and a few shared styles.
 */

import { strToU8, zipSync } from 'fflate';
import { columnIndexToLetters } from './xlsxReader';

export type XlsxWriteStyle = 'title' | 'header' | 'section' | 'wrap' | 'muted';

export interface XlsxWriteCell {
  value: string | number | boolean | null;
  /** Formula without '=' stored with `value` as its cached result. */
  formula?: string;
  style?: XlsxWriteStyle;
}

export type XlsxWriteValue = XlsxWriteCell | string | number | boolean | null | undefined;

export interface XlsxWriteSheet {
  name: string;
  rows: XlsxWriteValue[][];
  columnWidths?: number[];
  /** Number of rows to keep visible while scrolling. */
  freezeRows?: number;
  freezeColumns?: number;
  /** Drop-down lists, e.g. { range: 'A2:A200', source: 'Lists!$A$1:$A$9' } or a quoted CSV list. */
  listValidations?: Array<{ range: string; source: string }>;
}

const STYLE_INDEX: Record<XlsxWriteStyle, number> = {
  title: 1,
  header: 2,
  section: 3,
  wrap: 4,
  muted: 5,
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Arial"/><family val="2"/></font>
<font><i/><sz val="11"/><color rgb="FF595959"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// XML 1.0 forbids most control characters even when escaped.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeCell(value: XlsxWriteValue): XlsxWriteCell | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value;
  return { value };
}

function cellXml(reference: string, cell: XlsxWriteCell): string {
  const style = cell.style ? ` s="${STYLE_INDEX[cell.style]}"` : '';
  const formula = cell.formula ? `<f>${escapeXml(cell.formula)}</f>` : '';
  const { value } = cell;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cell ${reference} has a non-finite number`);
    return `<c r="${reference}"${style}>${formula}<v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}"${style} t="b">${formula}<v>${value ? 1 : 0}</v></c>`;
  }
  if (value === null) {
    return formula ? `<c r="${reference}"${style}>${formula}</c>` : `<c r="${reference}"${style}/>`;
  }
  if (formula) {
    return `<c r="${reference}"${style} t="str">${formula}<v>${escapeXml(value)}</v></c>`;
  }
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(sheet: XlsxWriteSheet): string {
  const freezeRows = sheet.freezeRows ?? 0;
  const freezeColumns = sheet.freezeColumns ?? 0;
  let pane = '';
  if (freezeRows > 0 || freezeColumns > 0) {
    const topLeft = `${columnIndexToLetters(freezeColumns + 1)}${freezeRows + 1}`;
    const activePane = freezeRows > 0 && freezeColumns > 0 ? 'bottomRight' : freezeRows > 0 ? 'bottomLeft' : 'topRight';
    pane = `<pane${freezeColumns > 0 ? ` xSplit="${freezeColumns}"` : ''}${freezeRows > 0 ? ` ySplit="${freezeRows}"` : ''} topLeftCell="${topLeft}" activePane="${activePane}" state="frozen"/>`;
  }
  const cols = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row
      .map((value, columnIndex) => {
        const cell = normalizeCell(value);
        return cell ? cellXml(`${columnIndexToLetters(columnIndex + 1)}${rowIndex + 1}`, cell) : '';
      })
      .join('');
    return cells ? `<row r="${rowIndex + 1}">${cells}</row>` : '';
  }).join('');

  const validations = sheet.listValidations?.length
    ? `<dataValidations count="${sheet.listValidations.length}">${sheet.listValidations.map((validation) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${escapeXml(validation.range)}"><formula1>${escapeXml(validation.source)}</formula1></dataValidation>`).join('')}</dataValidations>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${validations}</worksheet>`;
}

const INVALID_SHEET_NAME = /[[\]:*?/\\]/;

/** Serialize sheets into an .xlsx archive. */
export function writeXlsxWorkbook(sheets: XlsxWriteSheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error('A workbook needs at least one sheet');
  const names = new Set<string>();
  for (const sheet of sheets) {
    const key = sheet.name.toLowerCase();
    if (!sheet.name || sheet.name.length > 31 || INVALID_SHEET_NAME.test(sheet.name) || names.has(key)) {
      throw new Error(`Invalid or duplicate sheet name: ${sheet.name}`);
    }
    names.add(key);
  }

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES_XML),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet));
  });

  return zipSync(files, { level: 6 });
}

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
