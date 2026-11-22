import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { logger } from '../utils/logger';
import type { ApiAccessState } from '../utils/apiBase';
import './ApiAccessSection.css';

const API_GUIDE_URL = 'https://fire-tools-inc.github.io/app/docs/user/api-access.html';
const API_REFERENCE_URL = 'https://fire-tools-inc.github.io/app/api/';

type CopyTarget = 'address' | 'token' | 'path';

interface ApiAccessSectionProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Hides the section, e.g. when it does not match a settings search. */
  hidden?: boolean;
  /** Key used by the settings search to identify this section. */
  sectionKey?: string;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const isValidPort = (port: number) => Number.isInteger(port) && port >= 1024 && port <= 65535;

/** Desktop-only switch that serves the local API to other apps, scripts and AI agents on this computer. */
export function ApiAccessSection({ collapsed, onToggle, hidden, sectionKey }: ApiAccessSectionProps) {
  const { t } = useTranslation();
  const bridge = typeof window !== 'undefined' ? window.fireTools : undefined;
  const apiAccess = bridge?.apiAccess;
  const [state, setState] = useState<ApiAccessState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [portDraft, setPortDraft] = useState('');

  const accept = useCallback((next: ApiAccessState, failureKey: string) => {
    if (typeof next.enabled === 'boolean') {
      setState(next);
      if (typeof next.port === 'number') setPortDraft(String(next.port));
    }
    setProblem(next.ok ? null : t(failureKey, { message: next.error ?? '' }));
  }, [t]);

  useEffect(() => {
    if (!apiAccess || collapsed) return;
    let active = true;
    apiAccess.get().then(next => {
      if (active) accept(next, 'settings.apiAccess.loadError');
    }).catch(error => {
      logger.error('settings', 'api-access-load-failed', 'could not read the API access setting', { pii: { error: errorMessage(error) } });
      if (active) setProblem(t('settings.apiAccess.loadError', { message: errorMessage(error) }));
    });
    return () => { active = false; };
  }, [apiAccess, collapsed, accept, t]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const run = useCallback(async (action: () => Promise<ApiAccessState>, event: string, success?: string) => {
    if (!apiAccess || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const next = await action();
      accept(next, 'settings.apiAccess.updateError');
      if (next.ok) {
        logger.userAction('settings', event, `user changed local API access (${event})`);
        if (success) setNotice(success);
      } else {
        logger.error('settings', 'api-access-update-failed', 'could not update API access', { pii: { error: next.error } });
      }
    } catch (error) {
      logger.error('settings', 'api-access-update-failed', 'could not update API access', { pii: { error: errorMessage(error) } });
      setProblem(t('settings.apiAccess.updateError', { message: errorMessage(error) }));
    } finally {
      setBusy(false);
    }
  }, [apiAccess, busy, accept, t]);

  const copy = useCallback(async (target: CopyTarget, text?: string | null) => {
    try {
      if (target === 'token') {
        const result = await apiAccess?.copyToken();
        if (!result?.ok) throw new Error(result?.error ?? 'API access is off.');
      } else {
        if (!text) return;
        await navigator.clipboard.writeText(text);
      }
      setCopied(target);
      setNotice(t('settings.apiAccess.copied'));
    } catch (error) {
      logger.error('settings', 'api-access-copy-failed', `could not copy the API ${target}`, { pii: { error: errorMessage(error) } });
      setProblem(t('settings.apiAccess.copyError'));
    }
  }, [apiAccess, t]);

  const openLink = useCallback((url: string) => {
    if (bridge?.openExternal) {
      void bridge.openExternal(url).catch(error => {
        logger.error('settings', 'api-link-open-failed', 'could not open an API documentation link', { pii: { error: errorMessage(error) } });
      });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }, [bridge]);

  if (!apiAccess) return null;

  const enabled = state?.enabled === true;
  const unavailable = state !== null && !state.available;
  const draftPort = Number(portDraft);
  const portValid = portDraft.trim() !== '' && isValidPort(draftPort);
  const portChanged = portValid && draftPort !== state?.port;

  return (
    <section
      className="settings-section collapsible-section api-access-settings"
      data-settings-section={sectionKey}
      hidden={hidden}
    >
      <button
        className="collapsible-header"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls="api-access-content"
      >
        <h2>
          <MaterialIcon name="api" /> {t('settings.sections.apiAccess')}{' '}
          <MaterialIcon name="expand_more" size="small" className={`collapse-chevron${!collapsed ? ' is-open' : ''}`} />
        </h2>
      </button>
      {!collapsed && (
        <div id="api-access-content" className="collapsible-content">
          <p className="setting-help api-access-intro">{t('settings.apiAccess.description')}</p>
          <div className="setting-item">
            <div className="label-with-tooltip">
              <span id="api-access-label" className="setting-label">{t('settings.apiAccess.toggleLabel')}</span>
            </div>
            <div className="toggle-group" role="group" aria-labelledby="api-access-label">
              <button
                type="button"
                className={`toggle-btn ${!enabled ? 'active' : ''}`}
                aria-pressed={!enabled}
                disabled={busy || state === null}
                onClick={() => void run(() => apiAccess.set({ enabled: false }), 'api-access-disabled')}
              >
                <MaterialIcon name="block" size="small" /> {t('settings.apiAccess.off')}
              </button>
              <button
                type="button"
                className={`toggle-btn ${enabled ? 'active' : ''}`}
                aria-pressed={enabled}
                disabled={busy || state === null || unavailable}
                onClick={() => void run(() => apiAccess.set({ enabled: true }), 'api-access-enabled')}
              >
                <MaterialIcon name="api" size="small" /> {t('settings.apiAccess.on')}
              </button>
            </div>
          </div>

          {unavailable && <p className="callout callout--info">{t('settings.apiAccess.unavailable')}</p>}

          {enabled && !unavailable && (
            <>
              <p className="callout callout--warning">{t('settings.apiAccess.warning')}</p>

              <div className="setting-item">
                <span className="setting-label">{t('settings.apiAccess.addressLabel')}</span>
                <code className="api-access-value">{state?.baseUrl}</code>
                {state?.portError && (
                  <p className="callout callout--warning" role="status">
                    {state.portError === 'in_use'
                      ? t('settings.apiAccess.portInUse', { port: state.port })
                      : t('settings.apiAccess.portFailed', { port: state.port, message: state.portError })}
                  </p>
                )}
                <span className="setting-help">{t('settings.apiAccess.addressHelp')}</span>
                <div className="api-access-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => void copy('address', state?.baseUrl)}>
                    <MaterialIcon name={copied === 'address' ? 'check' : 'content_copy'} size="small" /> {t('settings.apiAccess.copyAddress')}
                  </button>
                </div>
              </div>

              <div className="setting-item">
                <label htmlFor="api-access-port">{t('settings.apiAccess.portLabel')}</label>
                <div className="api-access-port">
                  <input
                    id="api-access-port"
                    type="number"
                    inputMode="numeric"
                    min={1024}
                    max={65535}
                    step={1}
                    value={portDraft}
                    aria-invalid={!portValid}
                    aria-describedby="api-access-port-help"
                    onChange={event => setPortDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && portChanged) void run(() => apiAccess.set({ port: draftPort }), 'api-access-port-changed');
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || !portChanged}
                    onClick={() => void run(() => apiAccess.set({ port: draftPort }), 'api-access-port-changed')}
                  >
                    {t('settings.apiAccess.savePort')}
                  </button>
                </div>
                <span id="api-access-port-help" className="setting-help">
                  {portValid ? t('settings.apiAccess.portHelp', { port: state?.defaultPort ?? 47820 }) : t('settings.apiAccess.portInvalid')}
                </span>
              </div>

              <div className="setting-item">
                <span className="setting-label">{t('settings.apiAccess.tokenLabel')}</span>
                <span className="setting-help">{t('settings.apiAccess.tokenHelp')}</span>
                <div className="api-access-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => void copy('token')}>
                    <MaterialIcon name={copied === 'token' ? 'check' : 'key'} size="small" /> {t('settings.apiAccess.copyToken')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => void run(() => apiAccess.regenerateToken(), 'api-access-token-regenerated', t('settings.apiAccess.regenerated'))}
                  >
                    <MaterialIcon name="autorenew" size="small" /> {t('settings.apiAccess.regenerateToken')}
                  </button>
                </div>
              </div>

              <div className="setting-item">
                <span className="setting-label">{t('settings.apiAccess.fileLabel')}</span>
                <code className="api-access-value">{state?.discoveryFile}</code>
                <span className="setting-help">{t('settings.apiAccess.fileHelp')}</span>
                <div className="api-access-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => void copy('path', state?.discoveryFile)}>
                    <MaterialIcon name={copied === 'path' ? 'check' : 'content_copy'} size="small" /> {t('settings.apiAccess.copyPath')}
                  </button>
                </div>
              </div>

              <div className="setting-item">
                <span className="setting-label">{t('settings.apiAccess.exampleLabel')}</span>
                <pre className="api-access-example" tabIndex={0} aria-label={t('settings.apiAccess.exampleLabel')}><code>{`curl -H "Authorization: Bearer $FIRE_TOOLS_TOKEN" \\\n  ${state?.baseUrl ?? ''}/state/netWorth`}</code></pre>
              </div>
            </>
          )}

          <div className="api-access-actions">
            <button type="button" className="btn btn-ghost" onClick={() => openLink(API_GUIDE_URL)}>
              <MaterialIcon name="menu_book" size="small" /> {t('settings.apiAccess.guide')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => openLink(API_REFERENCE_URL)}>
              <MaterialIcon name="description" size="small" /> {t('settings.apiAccess.reference')}
            </button>
          </div>

          <p className="visually-hidden" role="status" aria-live="polite">{notice}</p>
          {problem && <p className="callout callout--danger" role="alert">{problem}</p>}
        </div>
      )}
    </section>
  );
}
