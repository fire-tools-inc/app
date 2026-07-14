import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/cookieSettings', () => ({
  loadSettings: () => ({ backend: { mode: 'embedded' } }),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('getEmbeddedBackendInfo', () => {
  beforeEach(() => {
    vi.resetModules();
    delete window.fireTools;
  });

  it('shares an in-flight Electron backend lookup', async () => {
    let resolveBackend!: (value: {
      url: string;
      dbPath: string;
      error: null;
    }) => void;
    const backendPromise = new Promise<{
      url: string;
      dbPath: string;
      error: null;
    }>((resolve) => {
      resolveBackend = resolve;
    });
    const getEmbeddedBackend = vi.fn(() => backendPromise);
    window.fireTools = { getEmbeddedBackend };

    const { getEmbeddedBackendInfo } = await import('../../src/utils/apiBase');
    const first = getEmbeddedBackendInfo();
    const second = getEmbeddedBackendInfo();

    expect(getEmbeddedBackend).toHaveBeenCalledOnce();

    const backend = {
      url: 'http://127.0.0.1:43210',
      dbPath: '/tmp/fire-tools.sqlite',
      error: null,
    };
    resolveBackend(backend);

    await expect(Promise.all([first, second])).resolves.toEqual([backend, backend]);
  });
});
