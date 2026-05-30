import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';

const SINGLE_USER_ID = 1;

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export const apiError = (status: number, code: string, message: string, details?: unknown): ApiError => ({
  status,
  code,
  message,
  details,
});

export const sendError = (res: Response, err: ApiError): void => {
  res.status(err.status).json({
    error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
  });
};

/**
 * Resolves the active user id. Single-user mode always returns 1.
 * Multi-tenant deployments may pass `x-user-id` (numeric) to override; useful
 * for tests and future bearer-auth integration.
 */
export const resolveUserId = (req: Request): number => {
  const raw = req.header('x-user-id');
  if (!raw) return SINGLE_USER_ID;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw apiError(400, 'invalid_user', `x-user-id must be a positive integer (got "${raw}")`);
  }
  return parsed;
};

export const parseIntParam = (raw: string, name: string): number => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw apiError(400, 'invalid_param', `Path parameter "${name}" must be a positive integer (got "${raw}")`);
  }
  return parsed;
};

export const parseYearMonth = (yearRaw: string, monthRaw: string): { year: number; month: number } => {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw apiError(400, 'invalid_param', `Year must be between 1900 and 2200 (got "${yearRaw}")`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw apiError(400, 'invalid_param', `Month must be between 1 and 12 (got "${monthRaw}")`);
  }
  return { year, month };
};

export interface PaginationQuery {
  limit: number;
  offset: number;
  cursor: string | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const decodeCursor = (raw: string): number => {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = Number(decoded);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error('not an int');
    }
    return parsed;
  } catch {
    throw apiError(400, 'invalid_param', 'Query "cursor" is not a valid pagination cursor');
  }
};

export const encodeCursor = (offset: number): string =>
  Buffer.from(String(offset), 'utf8').toString('base64url');

export const parsePagination = (req: Request): PaginationQuery => {
  const limitRaw = req.query.limit;
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== undefined && limitRaw !== '') {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_LIMIT) {
      throw apiError(400, 'invalid_param', `Query "limit" must be a positive integer ≤ ${MAX_LIMIT}`);
    }
    limit = parsed;
  }
  const cursorRaw = req.query.cursor;
  let offset = 0;
  let cursor: string | null = null;
  if (cursorRaw !== undefined && cursorRaw !== '') {
    if (typeof cursorRaw !== 'string') {
      throw apiError(400, 'invalid_param', `Query "cursor" must be a string`);
    }
    offset = decodeCursor(cursorRaw);
    cursor = cursorRaw;
  }
  return { limit, offset, cursor };
};

export const nextCursor = (offset: number, returned: number, limit: number): string | null =>
  returned < limit ? null : encodeCursor(offset + returned);

export const parseBody = <T>(schema: ZodSchema<T>, body: unknown): T => {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      throw apiError(400, 'invalid_body', 'Request body failed validation', err.flatten());
    }
    throw err;
  }
};

export const isApiError = (err: unknown): err is ApiError =>
  typeof err === 'object' && err !== null && 'status' in err && 'code' in err && 'message' in err;

/**
 * Wraps a route handler so any thrown ApiError or unexpected error is mapped
 * to a JSON response. Synchronous handlers only (matches our usage; we don't
 * await DB drivers — better-sqlite3 is sync).
 */
export const handler =
  (fn: (req: Request, res: Response) => void) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req, res);
    } catch (err) {
      if (isApiError(err)) {
        sendError(res, err);
        return;
      }
      next(err);
    }
  };

export const bool01 = (v: unknown): 0 | 1 => (v ? 1 : 0);
export const fromBool01 = (v: number | null | undefined): boolean => v === 1;
export const nowIso = (): string => new Date().toISOString();
