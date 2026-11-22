import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { sendError, apiError } from './http.js';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** Compares two secrets in constant time, independent of their lengths. */
export const tokensMatch = (supplied: string, expected: string): boolean =>
  timingSafeEqual(digest(supplied), digest(expected));

const isPublicRequest = (req: Request): boolean =>
  req.method === 'OPTIONS' || ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/health');

/**
 * Requires `Authorization: Bearer <token>` on every request it guards except
 * CORS preflights and the health probe. Mount it on the /api/v1 router.
 * `secondaryToken` is read per request, so a revocable token (e.g. desktop
 * API access) stops working as soon as it returns null.
 */
export const requireBearerToken = (token: string, secondaryToken?: () => string | null) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (isPublicRequest(req)) {
      next();
      return;
    }
    const match = /^Bearer\s+(.+)$/i.exec(req.header('authorization') ?? '');
    const supplied = match?.[1]?.trim();
    const secondary = secondaryToken?.() ?? null;
    if (supplied && (tokensMatch(supplied, token) || (secondary !== null && tokensMatch(supplied, secondary)))) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', 'Bearer');
    sendError(res, apiError(401, 'unauthorized', 'A valid bearer token is required. Send Authorization: Bearer <token>.'));
  };
