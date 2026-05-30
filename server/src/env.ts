const num = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
};

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

const parseCorsOrigins = (raw: string | undefined, fallback: string[]): string[] => {
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

export interface RateLimitEnv {
  windowMs: number;
  max: number;
}

export interface ServerEnv {
  port: number;
  host: string;
  databaseUrl: string;
  schemaPath: string;
  migrationsPath: string;
  corsOrigins: string[];
  corsAllowAll: boolean;
  rateLimit: RateLimitEnv;
  nodeEnv: 'development' | 'production' | 'test';
}

export const loadEnv = (): ServerEnv => {
  const nodeEnv = (process.env.NODE_ENV as ServerEnv['nodeEnv']) ?? 'development';
  const fallbackOrigins = nodeEnv === 'production' ? [] : DEFAULT_DEV_ORIGINS;
  return {
    port: num(process.env.PORT, 8787),
    host: process.env.HOST ?? '0.0.0.0',
    databaseUrl: process.env.DATABASE_URL ?? 'file:./data/firetools.db',
    schemaPath: process.env.SCHEMA_PATH ?? '../docs/database/schema.sql',
    migrationsPath: process.env.MIGRATIONS_PATH ?? 'migrations',
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN, fallbackOrigins),
    corsAllowAll: bool(process.env.CORS_ALLOW_ALL, false),
    rateLimit: {
      windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      max: num(process.env.RATE_LIMIT_MAX, 300),
    },
    nodeEnv,
  };
};
