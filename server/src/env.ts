const num = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export interface ServerEnv {
  port: number;
  host: string;
  databaseUrl: string;
  schemaPath: string;
  corsOrigin: string;
  nodeEnv: 'development' | 'production' | 'test';
}

export const loadEnv = (): ServerEnv => ({
  port: num(process.env.PORT, 8787),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'file:./data/firetools.db',
  schemaPath: process.env.SCHEMA_PATH ?? '../docs/database/schema.sql',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  nodeEnv: (process.env.NODE_ENV as ServerEnv['nodeEnv']) ?? 'development',
});
