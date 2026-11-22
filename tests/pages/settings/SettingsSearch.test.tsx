import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsPage } from '../../../src/components/SettingsPage';
import { AuditLogProvider } from '../../../src/contexts/AuditLogContext';
import { clearSettings, DEFAULT_SETTINGS, saveSettings } from '../../../src/utils/cookieSettings';
import { getSearchableText, getSearchTerms, matchesSearchTerms } from '../../../src/utils/settingsSearch';

beforeEach(() => {
  localStorage.clear();
  clearSettings();
  saveSettings({ ...DEFAULT_SETTINGS, accountName: 'Synthetic portfolio' });
});

function renderSettings() {
  return render(<MemoryRouter><AuditLogProvider><SettingsPage /></AuditLogProvider></MemoryRouter>);
}

const searchBox = () => screen.getByLabelText('Search settings') as HTMLInputElement;
const section = (key: string) => {
  const element = document.querySelector<HTMLElement>(`[data-settings-section="${key}"]`);
  if (!element) throw new Error(`Missing settings section ${key}`);
  return element;
};
const isExpanded = (key: string) => section(key).querySelector('.collapsible-header')?.getAttribute('aria-expanded');
const allSections = () => [...document.querySelectorAll<HTMLElement>('[data-settings-section]')];
const visibleSections = () => allSections().filter(element => !element.hidden).map(element => element.dataset.settingsSection);

// Async act lets sections that mount while searching (e.g. About) settle.
async function search(query: string) {
  await act(async () => {
    fireEvent.change(searchBox(), { target: { value: query } });
  });
}

describe('settings search', () => {
  it('opens a collapsed section that contains the setting and hides the rest', async () => {
    renderSettings();
    const total = allSections().length;
    expect(isExpanded('display')).toBe('false');
    expect(screen.queryByLabelText('Decimal Places')).toBeNull();

    await search('decimal places');

    expect(section('display').hidden).toBe(false);
    expect(isExpanded('display')).toBe('true');
    expect(screen.getByLabelText('Decimal Places')).toBeTruthy();
    expect(section('account').hidden).toBe(true);
    expect(section('aiFeatures').hidden).toBe(true);
    const matches = visibleSections().length;
    expect(matches).toBeGreaterThan(0);
    expect(matches).toBeLessThan(total);
    expect(screen.getByText(matches === 1 ? '1 section matches' : `${matches} sections match`)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    });
    expect(searchBox().value).toBe('');
    expect(document.activeElement).toBe(searchBox());
    expect(visibleSections()).toHaveLength(total);
    expect(isExpanded('display')).toBe('false');
    expect(isExpanded('account')).toBe('true');
  });

  it('requires every word, in any order, ignoring case and accents', async () => {
    renderSettings();
    await search('  PLÀCES   dÉcimal ');
    expect(section('display').hidden).toBe(false);

    await search('decimal synthetic-missing-word');
    expect(section('display').hidden).toBe(true);
  });

  it('reads labels, tooltips and accented text but not icon ligatures', () => {
    const root = document.createElement('section');
    root.innerHTML = '<h2><span aria-hidden="true">expand_more</span>Confidentialité</h2>'
      + '<span data-tooltip="Taux de change"><span aria-label="More info">i</span></span>'
      + '<input placeholder="Mon portefeuille"><button aria-label="Copy synthetic token"></button>';
    const text = getSearchableText(root);
    expect(matchesSearchTerms(text, getSearchTerms('confidentialite'))).toBe(true);
    expect(matchesSearchTerms(text, getSearchTerms('portefeuille TAUX change'))).toBe(true);
    expect(matchesSearchTerms(text, getSearchTerms('copy token'))).toBe(true);
    expect(matchesSearchTerms(text, getSearchTerms('expand'))).toBe(false);
    expect(matchesSearchTerms(text, getSearchTerms('more'))).toBe(false);
  });

  it('shows and announces an empty state that can clear the search', async () => {
    renderSettings();
    const total = allSections().length;
    await search('zzqx');

    expect(visibleSections()).toEqual([]);
    // Visible empty state plus the polite live region.
    expect(screen.getAllByText('No settings match “zzqx”')).toHaveLength(2);

    await act(async () => {
      fireEvent.click(screen.getByText('Clear search', { selector: '.settings-search-empty button' }));
    });
    expect(searchBox().value).toBe('');
    expect(document.activeElement).toBe(searchBox());
    expect(screen.queryByText('No settings match “zzqx”')).toBeNull();
    expect(visibleSections()).toHaveLength(total);
  });

  it('restores the expansion chosen before searching when Escape clears the query', async () => {
    renderSettings();
    fireEvent.click(section('display').querySelector('.collapsible-header')!);
    fireEvent.click(section('account').querySelector('.collapsible-header')!);
    expect(isExpanded('display')).toBe('true');
    expect(isExpanded('account')).toBe('false');

    await search('decimal');
    expect(isExpanded('currency')).toBe('true');
    // Collapsing a match while searching does not change the saved state.
    fireEvent.click(section('display').querySelector('.collapsible-header')!);
    expect(isExpanded('display')).toBe('false');
    expect(section('display').hidden).toBe(false);

    await act(async () => {
      fireEvent.keyDown(searchBox(), { key: 'Escape' });
    });
    expect(searchBox().value).toBe('');
    expect(allSections().every(element => !element.hidden)).toBe(true);
    expect(isExpanded('display')).toBe('true');
    expect(isExpanded('account')).toBe('false');
    expect(isExpanded('currency')).toBe('false');
  });

  it('re-checks text that a section renders after loading', async () => {
    renderSettings();
    // The About section only shows this message once its backend check fails.
    await search('client-only mode');
    await waitFor(() => expect(section('about').hidden).toBe(false));
    expect(screen.getByTestId('about-backend-error').textContent).toContain('client-only mode');
  });

  it('opens the AI model configuration while searching and closes it again afterwards', async () => {
    renderSettings();
    const details = section('aiFeatures').querySelector('details')!;
    expect(details.open).toBe(false);

    await search('api key');
    expect(section('aiFeatures').hidden).toBe(false);
    expect(details.open).toBe(true);

    await search('');
    expect(details.open).toBe(false);
  });
});
