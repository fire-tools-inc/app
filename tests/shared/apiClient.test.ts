import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ backend: { mode: 'embedded' } as { mode: string; customUrl?: string; customToken?: string } }));

vi.mock('../../src/utils/cookieSettings', () => ({
  loadSettings: () => ({ backend: settings.backend }),
}));

const ok = () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

describe('apiFetch', () => {
  beforeEach(() => {
    vi.resetModules();
    settings.backend = { mode: 'embedded' };
    delete window.fireTools;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.fireTools;
  });

  it('sends the embedded backend token as a bearer token', async () => {
    window.fireTools = {
      getEmbeddedBackend: async () => ({ url: 'http://127.0.0.1:43210', dbPath: '/synthetic.sqlite', error: null, token: 'embedded-token' }),
    };
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetch);
    const { apiFetch } = await import('../../src/utils/apiClient');
    await apiFetch('/sync/status', { headers: { 'Content-Type': 'application/json' } });
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:43210/api/v1/sync/status', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer embedded-token' },
    }));
  });

  it('uses the device-local custom token and leaves an explicit Authorization header alone', async () => {
    settings.backend = { mode: 'custom', customUrl: 'http://backend.test/', customToken: ' custom-token ' };
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetch);
    const { apiFetch } = await import('../../src/utils/apiClient');
    await apiFetch('/health');
    await apiFetch('/health', { headers: new Headers({ authorization: 'Bearer explicit' }) });
    expect(fetch.mock.calls[0]).toEqual(['http://backend.test/api/v1/health', { headers: { Authorization: 'Bearer custom-token' } }]);
    expect(fetch.mock.calls[1][1]).toEqual({ headers: { authorization: 'Bearer explicit' } });
  });

  it('sends no Authorization header without a token and fails clearly without a backend', async () => {
    settings.backend = { mode: 'custom', customUrl: 'http://backend.test' };
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetch);
    const { apiFetch, BackendUnavailableError } = await import('../../src/utils/apiClient');
    await apiFetch('/health');
    expect(fetch.mock.calls[0][1]).toEqual({ headers: {} });

    settings.backend = { mode: 'embedded' };
    await expect(apiFetch('/health')).rejects.toBeInstanceOf(BackendUnavailableError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports a rejected token when testing a connection', async () => {
    const fetch = vi.fn(async (url: string) => (url.endsWith('/health') ? ok() : new Response('{}', { status: 401 })));
    vi.stubGlobal('fetch', fetch);
    const { probeBackend } = await import('../../src/utils/apiClient');
    await expect(probeBackend('http://backend.test', { token: 'wrong' })).rejects.toMatchObject({ reason: 'unauthorized' });
    expect(fetch.mock.calls[1][1]).toMatchObject({ headers: { Authorization: 'Bearer wrong' } });
  });
});
