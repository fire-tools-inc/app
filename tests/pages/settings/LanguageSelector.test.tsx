import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import i18n, { DEFAULT_LANGUAGE, setLanguage } from '../../../src/i18n';
import { LanguageSelector } from '../../../src/components/LanguageSelector';
import { loadSettings } from '../../../src/utils/cookieSettings';

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

describe('LanguageSelector', () => {
  beforeEach(() => {
    cookieMock.clear();
    try { window.localStorage.clear(); } catch { /* no-op */ }
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it('renders all five supported languages as options', () => {
    render(<LanguageSelector />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value).sort();
    expect(values).toEqual(['de', 'en', 'es', 'fr', 'it']);
  });

  it('shows the current language as selected', async () => {
    await setLanguage('fr');
    render(<LanguageSelector />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('fr');
  });

  it('changes the active language and persists the choice when the user selects an option', async () => {
    render(<LanguageSelector />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'de' } });

    // Let the async setLanguage promise resolve.
    await new Promise((r) => setTimeout(r, 0));

    expect(i18n.language).toBe('de');
    expect(loadSettings().language).toBe('de');
  });

  it('falls back to English when i18n is in an unsupported language', async () => {
    await i18n.changeLanguage('zz');
    render(<LanguageSelector />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('en');
  });
});
