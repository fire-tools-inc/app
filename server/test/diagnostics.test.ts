import { describe, expect, it, vi } from 'vitest';
import { expectDiagnostic } from '../../tests/shared/diagnostics.js';

describe('backend diagnostic capture', () => {
  it.each(['warn', 'error'] as const)('captures %s logs after resetting modules', async level => {
    vi.resetModules();
    const { logger } = await import('../src/logger.js');
    logger[level]('synthetic', 'diagnostic-probe', 'Synthetic expected failure');
    expectDiagnostic(level, '[diagnostic-probe]: Synthetic expected failure');
  });

  it('captures the core log entry point without accepting unasserted errors', async () => {
    const { log } = await import('../src/logger.js');
    log('synthetic', 'system', 'diagnostic-probe', 'Synthetic expected failure', { level: 'error' });
    expectDiagnostic('error', '[diagnostic-probe]: Synthetic expected failure');
    expect(() => expectDiagnostic('error', 'Missing failure')).toThrow('received 0');
  });
});
