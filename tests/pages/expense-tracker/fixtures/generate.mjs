// Regenerates the sample paystub & invoice PDF fixtures used by the PDF
// parsing benchmark test. Both PDFs carry a real (uncompressed) text layer so
// that text-extraction engines (pdfjs and LiteParse) can read them without OCR.
//
// Run with: node tests/pages/expense-tracker/fixtures/generate.mjs
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));

// Minimal uncompressed PDF generator with a text layer (Helvetica).
// Produces a single-page PDF; lines are drawn top-to-bottom.
function makePdf(lines) {
  const leading = 16;
  const startY = 760;
  let content = 'BT\n/F1 11 Tf\n' + leading + ' TL\n72 ' + startY + ' Td\n';
  lines.forEach((ln, i) => {
    const esc = ln.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    if (i === 0) content += `(${esc}) Tj\n`;
    else content += `T*\n(${esc}) Tj\n`;
  });
  content += 'ET';

  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
  objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const paystub = [
  'ACME CORPORATION',
  '123 Business Avenue, Springfield',
  '',
  'EARNINGS STATEMENT / PAYSLIP',
  'Pay Period: 01/03/2024 - 31/03/2024',
  'Pay Date: 05/04/2024',
  '',
  'Employee: Jane Doe',
  'Employee ID: 00451',
  '',
  'Description            Amount',
  'Gross Pay             4,500.00',
  'Federal Tax            -675.00',
  'Social Security        -279.00',
  'Medicare                -65.25',
  'Health Insurance       -120.00',
  '',
  'Net Pay              USD 3,360.75',
  '',
  'Thank you for your work!',
];

const invoice = [
  'GLOBEX SOFTWARE LTD',
  'Invoice',
  '',
  'Invoice Number: INV-2024-0098',
  'Invoice Date: 15/03/2024',
  'Due Date: 14/04/2024',
  '',
  'Bill To: Wayne Enterprises',
  '',
  'Description                 Qty   Unit Price   Amount',
  'Cloud Hosting (monthly)      1      200.00     200.00',
  'Consulting Services         10      150.00   1,500.00',
  'Support Plan                 1       99.00      99.00',
  '',
  'Subtotal               1,799.00',
  'VAT (20%)                359.80',
  'Total Due            EUR 2,158.80',
  '',
  'Payment terms: net 30 days.',
];

writeFileSync(join(HERE, 'sample-paystub.pdf'), makePdf(paystub));
writeFileSync(join(HERE, 'sample-invoice.pdf'), makePdf(invoice));
console.log('written sample-paystub.pdf and sample-invoice.pdf');
