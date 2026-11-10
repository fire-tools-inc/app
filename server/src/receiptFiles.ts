import express, { type NextFunction, type Request, type Response } from 'express';
import { apiError, sendError } from './http.js';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type DocumentMimeType = keyof typeof DOCUMENT_EXTENSIONS;

export function validateDocumentBytes(bytes: Buffer, fileName: string, mimeType: string, allowPdf = false): DocumentMimeType {
  if (!Object.hasOwn(DOCUMENT_EXTENSIONS, mimeType) || (!allowPdf && mimeType === 'application/pdf')) {
    throw apiError(415, 'unsupported_document', 'Use a PDF, JPEG, PNG or WebP document; receipt storage accepts images only.');
  }
  if (!fileName || fileName.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(fileName) || fileName === '.' || fileName === '..') {
    throw apiError(400, 'invalid_body', 'Provide a file name without paths or control characters (maximum 255 characters).');
  }
  if (!bytes.length) throw apiError(400, 'invalid_body', 'The document is empty.');
  if (bytes.length > MAX_DOCUMENT_BYTES) throw apiError(413, 'payload_too_large', 'The document exceeds the 10 MB limit.');
  const valid = mimeType === 'application/pdf' ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
    : mimeType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw apiError(400, 'invalid_body', 'The document bytes do not match the declared file type.');
  return mimeType as DocumentMimeType;
}

export function documentFromRequest(req: Request, allowPdf = false) {
  const mimeType = req.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (!Buffer.isBuffer(req.body)) {
    throw apiError(Object.hasOwn(DOCUMENT_EXTENSIONS, mimeType) ? 400 : 415, 'invalid_body', 'Send the document as raw binary bytes with its image or PDF Content-Type.');
  }
  const fileName = typeof req.query.fileName === 'string' ? req.query.fileName : '';
  const type = validateDocumentBytes(req.body, fileName, mimeType, allowPdf);
  return { bytes: req.body, fileName, mimeType: type };
}

export const documentBody = [
  express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES }),
  (error: Error, _req: Request, res: Response, next: NextFunction) => {
    if ('type' in error && error.type === 'entity.too.large') {
      sendError(res, apiError(413, 'payload_too_large', 'The document exceeds the 10 MB limit.'));
    } else {
      next(error);
    }
  },
];
