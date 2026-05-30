import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BuildInfo {
  version: string;
  commit: string;
  buildTime: string | null;
  dependencies: Record<string, string>;
}

const FALLBACK_VERSION = '0.0.0';
const FALLBACK_COMMIT = 'unknown';

const loadPackageJson = (): {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // From src/ (dev) or dist/ (runtime) walk up to the directory containing package.json.
    const candidates = [
      resolve(here, '..', 'package.json'),
      resolve(here, '..', '..', 'package.json'),
    ];
    for (const candidate of candidates) {
      try {
        const raw = readFileSync(candidate, 'utf-8');
        return JSON.parse(raw);
      } catch {
        // try next candidate
      }
    }
  } catch (err) {
    console.error('[buildInfo] failed to read package.json:', (err as Error).message);
  }
  return {};
};

const pickDependencies = (
  pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
): Record<string, string> => {
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const wanted = ['better-sqlite3', 'express', 'cors', 'express-rate-limit', 'zod', 'typescript'];
  const out: Record<string, string> = {};
  for (const name of wanted) {
    if (all[name]) out[name] = all[name];
  }
  return out;
};

let cached: BuildInfo | null = null;

export const getBuildInfo = (): BuildInfo => {
  if (cached) return cached;
  const pkg = loadPackageJson();
  const version = pkg.version ?? process.env.npm_package_version ?? FALLBACK_VERSION;
  const commit =
    process.env.GIT_COMMIT_HASH ?? process.env.GIT_COMMIT ?? FALLBACK_COMMIT;
  const buildTime = process.env.BUILD_TIME ?? null;
  cached = {
    version,
    commit,
    buildTime,
    dependencies: pickDependencies(pkg),
  };
  return cached;
};
