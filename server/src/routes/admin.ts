import { Router } from 'express';
import { z } from 'zod';
import type { Database as DB } from 'better-sqlite3';
import { apiError, asyncHandler, parseBody, sendError } from '../http.js';
import { rekeyDatabase, RekeyError } from '../rekey.js';
import { WrongPassphraseError } from '../db.js';

/**
 * State shared between the admin router and the rest of the process so the
 * router knows whether the open db handle is currently encrypted. The flag
 * is mutated by successful rekeys.
 */
export interface AdminState {
  isEncrypted: () => boolean;
  setEncrypted: (v: boolean) => void;
}

const PassphraseBody = z.object({
  action: z.enum(['set', 'rotate', 'remove']),
  currentPassphrase: z.string().min(1).optional(),
  newPassphrase: z.string().min(8).max(1024).optional(),
});

export const buildAdminRouter = (db: DB, dbPath: string, state: AdminState): Router => {
  const router = Router();

  router.get(
    '/admin/db/encryption',
    asyncHandler(async (_req, res) => {
      res.json({ encrypted: state.isEncrypted() });
      return Promise.resolve();
    }),
  );

  router.post(
    '/admin/db/passphrase',
    asyncHandler(async (req, res) => {
      const body = parseBody(PassphraseBody, req.body);
      try {
        const result = await rekeyDatabase({
          db,
          dbPath,
          currentlyEncrypted: state.isEncrypted(),
          action: body.action,
          currentPassphrase: body.currentPassphrase,
          newPassphrase: body.newPassphrase,
        });
        state.setEncrypted(result.encrypted);
        res.json({
          action: result.action,
          encrypted: result.encrypted,
          backupPath: result.backupPath,
        });
      } catch (err) {
        if (err instanceof RekeyError) {
          sendError(res, apiError(err.status, err.code, err.message));
          return;
        }
        if (err instanceof WrongPassphraseError) {
          sendError(res, apiError(401, 'wrong_passphrase', err.message));
          return;
        }
        throw err;
      }
    }),
  );

  return router;
};
