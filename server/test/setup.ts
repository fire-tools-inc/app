import { beforeEach, onTestFinished, vi } from 'vitest';
import { testDiagnostics } from '../../tests/shared/diagnostics.js';

vi.mock('../src/logger.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/logger.js')>();
  const log: typeof actual.log = (section, actor, event, message, opts = {}) => {
    const level = opts.level ?? 'info';
    console[level](actual.formatLogEntry({
      timestamp: actual.formatTimestamp(), section, actor, event, message, level,
    }));
  };
  const logger: typeof actual.logger = {
    log,
    systemEvent: (section, event, message, opts) => log(section, 'system', event, message, opts),
    warn: (section, event, message, opts) => log(section, 'system', event, message, { ...opts, level: 'warn' }),
    error: (section, event, message, opts) => log(section, 'system', event, message, { ...opts, level: 'error' }),
    debug: (section, event, message, opts) => log(section, 'system', event, message, { ...opts, level: 'debug' }),
  };
  return { ...actual, log, logger };
});

beforeEach(() => {
  testDiagnostics.clear();
  const spies = [
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => testDiagnostics.record('warn', args)),
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => testDiagnostics.record('error', args)),
  ];
  onTestFinished(() => {
    try {
      testDiagnostics.assertEmpty();
    } finally {
      for (const spy of spies) spy.mockRestore();
      testDiagnostics.clear();
    }
  });
});
