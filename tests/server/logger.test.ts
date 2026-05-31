import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  log,
  logger,
  formatTimestamp,
  formatLogEntry,
  type LogEntry,
} from '../../server/src/logger';

const ORIGINAL_ENV = process.env.FIRE_TOOLS_LOG_PII;

let stderrWrites: string[] = [];
let stderrSpy: ReturnType<typeof vi.spyOn>;

const lastLine = (): string => stderrWrites[stderrWrites.length - 1] ?? '';

describe('server logger', () => {
  beforeEach(() => {
    stderrWrites = [];
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: unknown,
    ) => {
      stderrWrites.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    }) as typeof process.stderr.write);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    if (ORIGINAL_ENV === undefined) {
      delete process.env.FIRE_TOOLS_LOG_PII;
    } else {
      process.env.FIRE_TOOLS_LOG_PII = ORIGINAL_ENV;
    }
  });

  describe('formatTimestamp', () => {
    it('pads single-digit components and uses the YYYY-MM-DD HH:MM:SS shape', () => {
      const ts = formatTimestamp(new Date(2024, 0, 3, 4, 5, 6));
      expect(ts).toBe('2024-01-03 04:05:06');
    });
  });

  describe('formatLogEntry', () => {
    it('formats with event tag when present', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-03 04:05:06',
        section: 'api',
        actor: 'system',
        event: 'request-start',
        level: 'info',
        message: 'incoming request',
      };
      expect(formatLogEntry(entry)).toBe(
        '[2024-01-03 04:05:06] [api] [system] [request-start]: incoming request',
      );
    });

    it('omits the event segment when event is null', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-03 04:05:06',
        section: 'api',
        actor: 'system',
        event: null,
        level: 'info',
        message: 'ready',
      };
      expect(formatLogEntry(entry)).toBe(
        '[2024-01-03 04:05:06] [api] [system]: ready',
      );
    });
  });

  describe('PII gating via FIRE_TOOLS_LOG_PII', () => {
    it('omits PII from output when env is unset', () => {
      delete process.env.FIRE_TOOLS_LOG_PII;
      logger.error('db', 'query-failed', 'failed to run query', {
        pii: { sql: 'SELECT * FROM portfolio WHERE user_id=42', ticker: 'AAPL' },
      });
      const line = lastLine();
      expect(line).toContain('[db] [system] [query-failed]: failed to run query');
      expect(line).not.toContain('AAPL');
      expect(line).not.toContain('portfolio');
      expect(line).not.toContain('user_id=42');
    });

    it('omits PII from output when env is "0" / "false" / arbitrary value', () => {
      for (const v of ['0', 'false', 'no', 'whatever']) {
        process.env.FIRE_TOOLS_LOG_PII = v;
        stderrWrites = [];
        logger.warn('exchange-rate', 'rate-stale', 'cached rate too old', {
          pii: { symbol: 'EURUSD=X' },
        });
        expect(lastLine()).not.toContain('EURUSD');
      }
    });

    it('includes PII in output when env is "1"', () => {
      process.env.FIRE_TOOLS_LOG_PII = '1';
      logger.error('db', 'query-failed', 'failed to run query', {
        pii: { ticker: 'AAPL' },
      });
      expect(lastLine()).toContain('AAPL');
    });

    it('includes PII in output when env is "true"', () => {
      process.env.FIRE_TOOLS_LOG_PII = 'true';
      logger.error('db', 'query-failed', 'failed to run query', {
        pii: { ticker: 'AAPL' },
      });
      expect(lastLine()).toContain('AAPL');
    });
  });

  describe('output stream', () => {
    it('writes to stderr, not stdout', () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as typeof process.stdout.write);
      try {
        log('api', 'system', 'ready', 'server ready');
        expect(stdoutSpy).not.toHaveBeenCalled();
        expect(stderrSpy).toHaveBeenCalled();
      } finally {
        stdoutSpy.mockRestore();
      }
    });

    it('serialises PII as JSON when included', () => {
      process.env.FIRE_TOOLS_LOG_PII = '1';
      logger.error('db', 'query-failed', 'failed to run query', {
        pii: { ticker: 'AAPL', qty: 10 },
      });
      const line = lastLine();
      expect(line).toContain('{"ticker":"AAPL","qty":10}');
    });

    it('handles unserialisable PII gracefully', () => {
      process.env.FIRE_TOOLS_LOG_PII = '1';
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      logger.error('db', 'oops', 'circular ref', { pii: circular });
      expect(lastLine()).toContain('[unserialisable]');
    });
  });
});
