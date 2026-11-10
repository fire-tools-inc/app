import type { ExtractedPdf } from './pdfTextExtractor';
import { liteParseResultToExtractedPdf } from './liteParseResult';

export { liteParseResultToExtractedPdf } from './liteParseResult';
export type { LiteParseTextItem, LiteParsePage, LiteParseResult } from './liteParseResult';

export type LiteParseInput = Uint8Array | ArrayBuffer;
export interface LiteParseExtractOptions {
  ocrEnabled?: boolean;
  quiet?: boolean;
}

/** Node-only adapter used by benchmarks. The renderer uses the local backend. */
export async function extractPdfTextWithLiteParse(
  input: LiteParseInput,
  fileName: string,
  options: LiteParseExtractOptions = {},
): Promise<ExtractedPdf> {
  const { LiteParse } = await import('@llamaindex/liteparse');
  const parser = new LiteParse({ ocrEnabled: options.ocrEnabled ?? false, quiet: options.quiet ?? true });
  try {
    return liteParseResultToExtractedPdf(await parser.parse(input instanceof Uint8Array ? input : new Uint8Array(input)), fileName);
  } finally {
    parser.close();
  }
}
