import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../../../src/components/SettingsPage';
import { AuditLogProvider } from '../../../src/contexts/AuditLogContext';
import { clearSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../../src/utils/cookieSettings';
import SafeCookies from '../../../src/utils/safeCookies';
import { expectDiagnostic } from '../../shared/diagnostics';

const model = { baseUrl: 'http://localhost:11434/v1', model: 'synthetic-local-model', apiKey: '' };

beforeEach(() => {
  localStorage.clear();
  clearSettings();
  saveSettings({ ...DEFAULT_SETTINGS, llmCategorization: model, experimentalFeatures: { portfolioBreakdown: true, pdfImport: true } });
});

function renderSettings() {
  return render(<MemoryRouter><AuditLogProvider><SettingsPage /></AuditLogProvider></MemoryRouter>);
}

describe('bulk AI feature settings', () => {
  it('offers enable/disable-all controls without expanding experimental settings', () => {
    saveSettings({ ...loadSettings(), experimentalFeatures: { portfolioBreakdown: false, pdfImport: false } });
    renderSettings();
    expect(screen.getByRole('button', { name: 'Disable all AI features' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enable all AI features' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'AI features' })).toBeTruthy();
    fireEvent.click(screen.getByText('Model configuration'));
    expect(screen.getByLabelText('Base URL')).toBeTruthy();
    expect(screen.getByLabelText('Model')).toBeTruthy();
  });

  it('reflects preference changes made while Settings remains mounted', () => {
    renderSettings();
    act(() => { saveSettings({ ...loadSettings(), aiFeaturesEnabled: false }); });
    expect(screen.getByRole('button', { name: 'Disable all AI features' }).getAttribute('aria-pressed')).toBe('true');
    act(() => { saveSettings({ ...loadSettings(), aiFeaturesEnabled: true }); });
    expect(screen.getByRole('button', { name: 'Enable all AI features' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('persists the global switch without clearing models or unrelated imports and restores it on enable', () => {
    const { unmount } = renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Disable all AI features' }));
    expect(loadSettings().aiFeaturesEnabled).toBe(false);
    expect(loadSettings().llmCategorization).toEqual(model);
    expect(loadSettings().experimentalFeatures).toEqual({ portfolioBreakdown: true, pdfImport: true });
    expect(screen.getByRole('button', { name: 'Disable all AI features' }).getAttribute('aria-pressed')).toBe('true');
    unmount();
    renderSettings();
    expect(screen.getByRole('button', { name: 'Disable all AI features' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Enable all AI features' }));
    expect(loadSettings().aiFeaturesEnabled).toBe(true);
    expect(loadSettings().llmCategorization).toEqual(model);
  });

  it('keeps the previous switch state and announces a failed settings write', () => {
    renderSettings();
    const write = vi.spyOn(SafeCookies, 'set').mockImplementation(() => { throw new Error('Synthetic unavailable storage'); });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Disable all AI features' }));
      expect(loadSettings().aiFeaturesEnabled).toBe(true);
      expect(screen.getByRole('button', { name: 'Enable all AI features' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('alert').textContent).toContain('Could not save settings');
      expectDiagnostic('error', '[save-failed]: failed to save settings');
      expectDiagnostic('error', '[setting-save-failed]: Could not save the setting.');
    } finally {
      write.mockRestore();
    }
  });

  it('reports a real Electron localStorage failure instead of showing the switch as saved', () => {
    vi.stubGlobal('fireTools', {});
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Synthetic full storage');
    });
    try {
      renderSettings();
      fireEvent.click(screen.getByRole('button', { name: 'Disable all AI features' }));
      expect(loadSettings().aiFeaturesEnabled).toBe(true);
      expect(screen.getByRole('button', { name: 'Enable all AI features' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('alert').textContent).toContain('Could not save settings');
      expectDiagnostic('error', '[localStorage-write-failed]: failed to write to localStorage');
      expectDiagnostic('error', '[save-failed]: failed to save settings');
      expectDiagnostic('error', '[setting-save-failed]: Could not save the setting.');
    } finally {
      write.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
