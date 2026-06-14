import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// cookieSettings resolves its experimental-feature defaults at module load from
// IS_DEMO_MODE. Reset the module registry and mock demo mode per test so the
// graph re-evaluates with the requested variant.
describe('Cookie Settings — demo mode experimental features', () => {
  beforeEach(() => {
    vi.resetModules();
    try {
      window.localStorage.clear();
    } catch {
      // localStorage may be unavailable in some test envs; ignore.
    }
  });

  afterEach(() => {
    vi.doUnmock('../../../src/utils/demoMode');
    vi.resetModules();
  });

  it('enables every experimental feature by default in the demo', async () => {
    vi.doMock('../../../src/utils/demoMode', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../src/utils/demoMode')>();
      return { ...actual, IS_DEMO_MODE: true };
    });

    const { DEFAULT_SETTINGS, EFFECTIVE_EXPERIMENTAL_DEFAULTS, loadSettings } = await import(
      '../../../src/utils/cookieSettings'
    );

    // Future-proof: every experimental flag must be on in the demo.
    for (const value of Object.values(EFFECTIVE_EXPERIMENTAL_DEFAULTS)) {
      expect(value).toBe(true);
    }

    expect(DEFAULT_SETTINGS.experimentalFeatures.portfolioBreakdown).toBe(true);
    expect(DEFAULT_SETTINGS.experimentalFeatures.pdfImport).toBe(true);

    // No stored cookie -> demo defaults (all features enabled).
    const loaded = loadSettings();
    expect(loaded.experimentalFeatures.portfolioBreakdown).toBe(true);
    expect(loaded.experimentalFeatures.pdfImport).toBe(true);
  });

  it('keeps experimental features opt-in (all off) outside the demo', async () => {
    vi.doMock('../../../src/utils/demoMode', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../src/utils/demoMode')>();
      return { ...actual, IS_DEMO_MODE: false };
    });

    const { EFFECTIVE_EXPERIMENTAL_DEFAULTS } = await import('../../../src/utils/cookieSettings');

    for (const value of Object.values(EFFECTIVE_EXPERIMENTAL_DEFAULTS)) {
      expect(value).toBe(false);
    }
  });
});
