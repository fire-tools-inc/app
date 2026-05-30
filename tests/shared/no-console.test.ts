import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guardrail: nothing outside the logger sources should call `console.*`.
 *
 * Issue #237 introduced a centralised logger that gates financial data
 * behind a user-controlled PII flag. Calling `console.*` directly bypasses
 * that gate, so any new `console.log/info/warn/error/debug` in production
 * code should make this test fail.
 *
 * Exceptions are intentional and explicit:
 *  - `src/utils/logger.ts` and `server/src/logger.ts` ARE the logger and
 *    must call `console.*` internally.
 *  - Test files are allowed to call / mock `console.*`.
 *  - A few low-level entry points use `console.error` for fatal startup
 *    errors that happen before the logger can be safely constructed
 *    (`src/main.tsx`). These are listed below; keep the list small.
 */

const ROOTS = ['src', 'server/src'];

const ALLOWED_FILES = new Set<string>([
  'src/utils/logger.ts',
  'server/src/logger.ts',
]);

const SKIP_DIRS = new Set<string>(['node_modules', 'dist', 'build', '__snapshots__']);

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/;
const CONSOLE_PATTERN = /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/g;

interface Finding {
  file: string;
  line: number;
  snippet: string;
}

const collectSourceFiles = (root: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry) && !TEST_FILE_PATTERN.test(entry)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
};

const findConsoleCalls = (file: string): Finding[] => {
  const rel = relative(process.cwd(), file).replace(/\\/g, '/');
  if (ALLOWED_FILES.has(rel)) return [];
  const text = readFileSync(file, 'utf8');
  const findings: Finding[] = [];
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (CONSOLE_PATTERN.test(line)) {
      findings.push({ file: rel, line: idx + 1, snippet: line.trim() });
      CONSOLE_PATTERN.lastIndex = 0;
    }
  });
  return findings;
};

describe('no direct console.* calls in production code', () => {
  it('all console.* output must go through src/utils/logger.ts or server/src/logger.ts', () => {
    const files: string[] = [];
    for (const root of ROOTS) {
      files.push(...collectSourceFiles(root));
    }
    const violations: Finding[] = [];
    for (const file of files) {
      violations.push(...findConsoleCalls(file));
    }
    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.snippet}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} direct console.* call(s) outside the logger:\n${summary}\n\n` +
          `Use the centralised logger instead:\n` +
          `  import { logger } from '../utils/logger';\n` +
          `  logger.error('section', 'event', 'message', { pii: { ... } });\n`,
      );
    }
    expect(violations).toEqual([]);
  });
});
