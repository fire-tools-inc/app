import { describe, it, expect, beforeEach, vi } from 'vitest';

import * as loggingPii from '../../src/utils/loggingPii';
import {
  log,
  logger,
  getLogBuffer,
  clearLogBuffer,
  exportLogsAsText,
  formatTimestamp,
  formatLogEntry,
} from '../../src/utils/logger';

const piiFlagSpy = vi.spyOn(loggingPii, 'isPiiLoggingEnabled');

const setPii = (enabled: boolean) => {
  piiFlagSpy.mockImplementation(() => enabled);
};

describe('logger', () => {
  beforeEach(() => {
    clearLogBuffer();
    setPii(false);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  describe('formatTimestamp', () => {
    it('pads single-digit components and uses the YYYY-MM-DD HH:MM:SS shape', () => {
      const ts = formatTimestamp(new Date(2024, 0, 3, 4, 5, 6));
      expect(ts).toBe('2024-01-03 04:05:06');
    });
  });

  describe('formatLogEntry', () => {
    it('omits the event segment when event is null', () => {
      const line = formatLogEntry({
        timestamp: '2024-01-01 00:00:00',
        section: 'app',
        actor: 'system',
        event: null,
        level: 'info',
        message: 'hello',
      });
      expect(line).toBe('[2024-01-01 00:00:00] [app] [system]: hello');
    });

    it('includes the event segment when present', () => {
      const line = formatLogEntry({
        timestamp: '2024-01-01 00:00:00',
        section: 'app',
        actor: 'user',
        event: 'click',
        level: 'info',
        message: 'pressed save',
      });
      expect(line).toBe('[2024-01-01 00:00:00] [app] [user] [click]: pressed save');
    });
  });

  describe('PII gating (off by default)', () => {
    it('drops the pii field from buffer entries when flag is off', () => {
      log('asset-allocation', 'user', 'rebalance', 'recomputed portfolio', {
        pii: { ticker: 'AAPL', quantity: 100, amount: 19234.56 },
      });
      const [entry] = getLogBuffer();
      expect(entry.pii).toBeUndefined();
    });

    it('keeps the pii field when the flag is on', () => {
      setPii(true);
      log('asset-allocation', 'user', 'rebalance', 'recomputed portfolio', {
        pii: { ticker: 'AAPL', quantity: 100 },
      });
      const [entry] = getLogBuffer();
      expect(entry.pii).toEqual({ ticker: 'AAPL', quantity: 100 });
    });

    it('never leaks PII tokens into the exported text when flag is off', () => {
      log('asset-allocation', 'user', 'rebalance', 'recomputed portfolio', {
        pii: { ticker: 'TSLA', quantity: 42, account: 'My IRA' },
      });
      log('net-worth', 'system', 'snapshot', 'recorded snapshot', {
        pii: { totalEUR: 123456.78, holdings: [{ ticker: 'VWCE', qty: 200 }] },
      });
      const text = exportLogsAsText();
      const forbidden = ['TSLA', 'VWCE', '42', 'My IRA', '123456.78', '200'];
      for (const token of forbidden) {
        expect(text.includes(token), `expected exported text to NOT contain "${token}"`).toBe(false);
      }
    });

    it('fails closed if the pii flag reader throws (treats PII as disabled)', () => {
      piiFlagSpy.mockImplementation(() => {
        throw new Error('corrupt cookie');
      });
      log('app', 'system', 'boot', 'started', { pii: { secret: 'shh' } });
      const [entry] = getLogBuffer();
      expect(entry.pii).toBeUndefined();
    });
  });

  describe('ring buffer', () => {
    it('caps the buffer at 1000 entries (newest retained)', () => {
      for (let i = 0; i < 1100; i++) {
        log('app', 'system', null, `entry-${i}`);
      }
      const buf = getLogBuffer();
      expect(buf.length).toBe(1000);
      expect(buf[0].message).toBe('entry-100');
      expect(buf[buf.length - 1].message).toBe('entry-1099');
    });
  });

  describe('convenience helpers', () => {
    it('userAction records actor=user with the event tag', () => {
      logger.userAction('settings', 'toggle-privacy', 'flipped privacy mode');
      const [entry] = getLogBuffer();
      expect(entry.actor).toBe('user');
      expect(entry.section).toBe('settings');
      expect(entry.event).toBe('toggle-privacy');
      expect(entry.level).toBe('info');
    });

    it('error helper sets level=error and actor=system', () => {
      logger.error('api', 'fetch-failed', 'request bombed');
      const [entry] = getLogBuffer();
      expect(entry.actor).toBe('system');
      expect(entry.level).toBe('error');
    });
  });

  describe('exportLogsAsText', () => {
    it('renders a placeholder when the buffer is empty', () => {
      const text = exportLogsAsText();
      expect(text).toContain('no entries');
    });

    it('formats each entry as a structured line', () => {
      log('app', 'system', 'boot', 'starting');
      const text = exportLogsAsText();
      expect(text).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[app\] \[system\] \[boot\]: starting/);
    });
  });
});
