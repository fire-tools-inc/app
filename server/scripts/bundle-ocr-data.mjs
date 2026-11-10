import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const source = require('@tesseract.js-data/eng');
if (source.code !== 'eng' || source.gzip !== true || typeof source.langPath !== 'string') {
  throw new Error('The pinned English OCR data package has an unexpected layout.');
}
const bytes = gunzipSync(await readFile(join(source.langPath, 'eng.traineddata.gz')));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const output = fileURLToPath(new URL('../tessdata/', import.meta.url));
await mkdir(output, { recursive: true });
const temporary = join(output, `eng.traineddata.${process.pid}.tmp`);
try {
  await writeFile(temporary, bytes);
  await rename(temporary, join(output, 'eng.traineddata'));
  await writeFile(join(output, 'LICENSE.txt'), await readFile(new URL('./ocr-data.LICENSE.txt', import.meta.url)));
  await writeFile(join(output, 'NOTICE.txt'), [
    'English Tesseract trained data, distributed unmodified.',
    'Source: @tesseract.js-data/eng@1.0.0 (4.0.0/eng.traineddata.gz).',
    'Data repository: https://github.com/naptha/tessdata (Apache-2.0).',
    'Package wrapper code is MIT-licensed and is not included in this data bundle.',
    `Uncompressed SHA-256: ${sha256}`,
    '',
  ].join('\n'));
} finally {
  await rm(temporary, { force: true });
}
process.stdout.write(`[bundle-ocr-data] English OCR data bundled locally (${bytes.length} bytes).\n`);
