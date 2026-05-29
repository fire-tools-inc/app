import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { loadEnv } from './env.js';
import { initDb } from './db.js';
import { buildHealthRouter } from './routes/health.js';
import { buildUsersRouter } from './routes/users.js';
import { buildNotImplementedRouter } from './routes/notImplemented.js';

const env = loadEnv();

const { db, schemaApplied, dbPath } = initDb(env);
if (schemaApplied) {
  console.error(`[db] applied schema to fresh database at ${dbPath}`);
} else {
  console.error(`[db] reusing existing database at ${dbPath}`);
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: env.corsOrigin }));

const v1 = express.Router();
v1.use(buildHealthRouter(db, dbPath));
v1.use(buildUsersRouter(db));
v1.use(buildNotImplementedRouter());
app.use('/api/v1', v1);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[express] unhandled', err);
  res.status(500).json({
    error: { code: 'internal_error', message: err.message },
  });
});

const server = app.listen(env.port, env.host, () => {
  console.error(`[server] fire-tools backend listening on http://${env.host}:${env.port}`);
});

const shutdown = (signal: string) => {
  console.error(`[server] received ${signal}, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
