import express, { type NextFunction, type Request, type Response } from 'express';
import cors, { type CorsOptions } from 'cors';
import rateLimit from 'express-rate-limit';
import type { Database as DB } from 'better-sqlite3';
import type { ServerEnv } from './env.js';
import { buildHealthRouter } from './routes/health.js';
import { buildUsersRouter } from './routes/users.js';
import { buildSettingsRouter } from './routes/settings.js';
import { buildNotificationsRouter } from './routes/notifications.js';
import { buildCalculatorRouter } from './routes/calculator.js';
import { buildMonteCarloRouter } from './routes/monteCarlo.js';
import { buildAssetAllocationRouter } from './routes/assetAllocation.js';
import { buildExpenseTrackerRouter } from './routes/expenseTracker.js';
import { buildNetWorthRouter } from './routes/netWorth.js';
import { buildQuestionnaireRouter } from './routes/questionnaire.js';
import { buildPdfImportsRouter } from './routes/pdfImports.js';
import { buildPortfolioBreakdownRouter } from './routes/portfolioBreakdown.js';
import { buildBanksRouter } from './routes/banks.js';
import { buildNotImplementedRouter } from './routes/notImplemented.js';
import { buildUiPreferencesRouter } from './routes/uiPreferences.js';
import { logger } from './logger.js';
import { createSettingsFileStore, migrateLegacySettingsFile, type SettingsFileStore } from './settingsFile.js';

export interface BuildAppOptions {
  db: DB;
  env: ServerEnv;
  dbPath: string;
  disableRateLimit?: boolean;
}

export const buildApp = ({ db, env, dbPath, disableRateLimit }: BuildAppOptions) => {
  const corsOptions: CorsOptions = {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (env.corsAllowAll) {
        cb(null, true);
        return;
      }
      if (env.corsOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error(`Origin ${origin} not allowed by CORS policy`));
    },
    credentials: false,
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cors(corsOptions));

  const v1 = express.Router();
  if (!disableRateLimit) {
    v1.use(
      rateLimit({
        windowMs: env.rateLimit.windowMs,
        max: env.rateLimit.max,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: { code: 'rate_limited', message: 'Too many requests, slow down.' } },
      }),
    );
  }
  // Settings file persistence: mirror DB → JSON in the DB's directory.
  // Skipped for in-memory DBs (tests) where there is no meaningful path.
  const isInMemoryDb = dbPath === ':memory:' || dbPath === '';
  let settingsFileStore: SettingsFileStore | undefined;
  if (!isInMemoryDb) {
    try {
      migrateLegacySettingsFile(dbPath);
      settingsFileStore = createSettingsFileStore(dbPath);
      // Initial mirror so the file always reflects current DB state at boot.
      settingsFileStore.syncFromDb(db);
    } catch (err) {
      logger.error('app', null, `failed to initialise settings file store: ${err}`);
      settingsFileStore = undefined;
    }
  }

  v1.use(buildHealthRouter(db, dbPath));
  v1.use(buildUsersRouter(db));
  v1.use(buildSettingsRouter(db, settingsFileStore));
  v1.use(buildNotificationsRouter(db));
  v1.use(buildCalculatorRouter(db));
  v1.use(buildMonteCarloRouter(db));
  v1.use(buildAssetAllocationRouter(db));
  v1.use(buildExpenseTrackerRouter(db));
  v1.use(buildNetWorthRouter(db));
  v1.use(buildQuestionnaireRouter(db));
  v1.use(buildPdfImportsRouter(db));
  v1.use(buildPortfolioBreakdownRouter(db));
  v1.use(buildBanksRouter(db));
  v1.use(buildUiPreferencesRouter(db));
  v1.use(buildNotImplementedRouter());
  app.use('/api/v1', v1);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err.message?.startsWith('Origin ') && err.message.endsWith(' not allowed by CORS policy')) {
      res.status(403).json({ error: { code: 'cors_denied', message: err.message } });
      return;
    }
    logger.error('express', 'unhandled-error', err.message, { pii: { stack: err.stack } });
    res.status(500).json({
      error: { code: 'internal_error', message: err.message },
    });
  });

  return app;
};
