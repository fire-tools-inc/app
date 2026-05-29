import { Router, type Request, type Response } from 'express';
import type { Database } from 'better-sqlite3';

interface UserRow {
  id: number;
  email: string;
  display_name: string | null;
  created_at: string;
}

const toApiUser = (row: UserRow) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  createdAt: row.created_at,
});

export const buildUsersRouter = (db: Database): Router => {
  const router = Router();

  router.get('/users/me', (_req: Request, res: Response) => {
    const row = db
      .prepare('SELECT id, email, display_name, created_at FROM users WHERE id = 1')
      .get() as UserRow | undefined;
    if (!row) {
      res.status(404).json({
        error: { code: 'not_found', message: 'Bootstrap user (id=1) missing. Schema not initialized?' },
      });
      return;
    }
    res.json(toApiUser(row));
  });

  return router;
};
