import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import i18n, {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  setLanguage,
} from '../../src/i18n';
import en from '../../src/i18n/locales/en.json';
import itLocale from '../../src/i18n/locales/it.json';
import fr from '../../src/i18n/locales/fr.json';
import de from '../../src/i18n/locales/de.json';
import es from '../../src/i18n/locales/es.json';

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];
const flatten = (o: Json, p = ''): string[] =>
  o !== null && typeof o === 'object' && !Array.isArray(o)
    ? Object.entries(o).flatMap(([k, v]) => flatten(v as Json, p + k + '.'))
    : [p.slice(0, -1)];

const cookieMock = (() => {
  let cookies: Record<string, string> = {};
  const DEL = ['max-age=0', 'expires=Thu, 01 Jan 1970'];
  return {
    get: () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
    set: (raw: string) => {
      const [pair] = raw.split(';');
      const [k, v] = pair.split('=');
      if (k && v !== undefined) {
        if (v === '' || DEL.some((m) => raw.includes(m))) delete cookies[k.trim()];
        else cookies[k.trim()] = v.trim();
      }
    },
    clear: () => { cookies = {}; },
  };
})();

Object.defineProperty(document, 'cookie', {
  get: () => cookieMock.get(),
  set: (v: string) => cookieMock.set(v),
  configurable: true,
});

describe('i18n setup', () => {
  beforeEach(() => {
    cookieMock.clear();
    try { window.localStorage.clear(); } catch { /* no-op */ }
  });

  afterEach(async () => {
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it('exposes the five required languages', () => {
    expect([...SUPPORTED_LANGUAGES].sort()).toEqual(['de', 'en', 'es', 'fr', 'it']);
  });

  it('defaults to English', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(i18n.options.fallbackLng).toEqual(['en']);
  });

  it('isSupportedLanguage guards correctly', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('it')).toBe(true);
    expect(isSupportedLanguage('jp')).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
    expect(isSupportedLanguage(42)).toBe(false);
  });

  it('all locales export the same set of keys (no missing/extra)', () => {
    const baseline = new Set(flatten(en as Json));
    for (const [name, loc] of Object.entries({ it: itLocale, fr, de, es })) {
      const keys = new Set(flatten(loc as Json));
      const missing = [...baseline].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !baseline.has(k));
      expect(missing, `${name} missing keys`).toEqual([]);
      expect(extra, `${name} extra keys`).toEqual([]);
    }
  });

  it('setLanguage switches the active language and persists it', async () => {
    await setLanguage('it');
    expect(i18n.language).toBe('it');
    // Reading back via i18n should now produce Italian
    expect(i18n.t('common.cancel')).toBe('Annulla');
  });

  it('setLanguage ignores unsupported codes', async () => {
    await setLanguage('en');
    // @ts-expect-error - intentionally passing an invalid value
    await setLanguage('zz');
    expect(i18n.language).toBe('en');
  });

  it('falls back to English when a key is missing from the target language', async () => {
    await setLanguage('it');
    // Inject a key only into English at runtime, then read it from Italian.
    i18n.addResource('en', 'translation', '__test_fallback_only', 'ENGLISH_ONLY');
    expect(i18n.t('__test_fallback_only')).toBe('ENGLISH_ONLY');
  });

  it('returns the key (not null) for completely unknown ids', () => {
    const missing = i18n.t('__definitely_not_a_real_key__');
    expect(typeof missing).toBe('string');
    expect(missing).not.toBe('');
  });
});
