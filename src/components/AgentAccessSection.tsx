import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { logger } from '../utils/logger';
import type { AgentAccessState } from '../utils/apiBase';
import './AgentAccessSection.css';

const AGENT_GUIDE_URL = 'https://fire-tools-inc.github.io/app/docs/user/ai-agents.html';

interface AgentAccessSectionProps {
  collapsed: boolean;
  onToggle: () => void;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Desktop-only switch that publishes the local API to AI agents on this computer. */
export function AgentAccessSection({ collapsed, onToggle }: AgentAccessSectionProps) {
  const { t } = useTranslation();
  const bridge = typeof window !== 'undefined' ? window.fireTools : undefined;
  const agentAccess = bridge?.agentAccess;
  const [state, setState] = useState<AgentAccessState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!agentAccess || collapsed) return;
    let active = true;
    agentAccess.get().then(next => {
      if (!active) return;
      setState(next);
      setProblem(next.ok ? null : t('settings.agentAccess.loadError', { message: next.error ?? '' }));
    }).catch(error => {
      logger.error('settings', 'agent-access-load-failed', 'could not read the agent access setting', { pii: { error: errorMessage(error) } });
      if (active) setProblem(t('settings.agentAccess.loadError', { message: errorMessage(error) }));
    });
    return () => { active = false; };
  }, [agentAccess, collapsed, t]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!agentAccess || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const next = await agentAccess.set({ enabled });
      if (next.ok) {
        setState(next);
        logger.userAction('settings', enabled ? 'agent-access-enabled' : 'agent-access-disabled', `user ${enabled ? 'enabled' : 'disabled'} local agent access`);
      } else {
        logger.error('settings', 'agent-access-update-failed', 'could not update agent access', { pii: { error: next.error } });
        setProblem(t('settings.agentAccess.updateError', { message: next.error ?? '' }));
        if (typeof next.enabled === 'boolean') setState(next);
      }
    } catch (error) {
      logger.error('settings', 'agent-access-update-failed', 'could not update agent access', { pii: { error: errorMessage(error) } });
      setProblem(t('settings.agentAccess.updateError', { message: errorMessage(error) }));
    } finally {
      setBusy(false);
    }
  }, [agentAccess, busy, t]);

  const copyPath = useCallback(async () => {
    if (!state?.discoveryFile) return;
    try {
      await navigator.clipboard.writeText(state.discoveryFile);
      setCopied(true);
    } catch (error) {
      logger.error('settings', 'agent-access-copy-failed', 'could not copy the agent connection file path', { pii: { error: errorMessage(error) } });
      setProblem(t('settings.agentAccess.copyError'));
    }
  }, [state, t]);

  const openGuide = useCallback(() => {
    if (bridge?.openExternal) {
      void bridge.openExternal(AGENT_GUIDE_URL).catch(error => {
        logger.error('settings', 'agent-guide-open-failed', 'could not open the agent guide', { pii: { error: errorMessage(error) } });
      });
    } else {
      window.open(AGENT_GUIDE_URL, '_blank', 'noopener');
    }
  }, [bridge]);

  if (!agentAccess) return null;

  const enabled = state?.enabled === true;
  const unavailable = state !== null && !state.available;

  return (
    <section className="settings-section collapsible-section agent-access-settings">
      <button
        className="collapsible-header"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls="agent-access-content"
      >
        <h2>
          <MaterialIcon name="smart_toy" /> {t('settings.sections.agentAccess')}{' '}
          <MaterialIcon name="expand_more" size="small" className={`collapse-chevron${!collapsed ? ' is-open' : ''}`} />
        </h2>
      </button>
      {!collapsed && (
        <div id="agent-access-content" className="collapsible-content">
          <p className="setting-help agent-access-intro">{t('settings.agentAccess.description')}</p>
          <div className="setting-item">
            <div className="label-with-tooltip">
              <span id="agent-access-label" className="setting-label">{t('settings.agentAccess.toggleLabel')}</span>
            </div>
            <div className="toggle-group" role="group" aria-labelledby="agent-access-label">
              <button
                type="button"
                className={`toggle-btn ${!enabled ? 'active' : ''}`}
                aria-pressed={!enabled}
                disabled={busy || state === null}
                onClick={() => void setEnabled(false)}
              >
                <MaterialIcon name="block" size="small" /> {t('settings.agentAccess.off')}
              </button>
              <button
                type="button"
                className={`toggle-btn ${enabled ? 'active' : ''}`}
                aria-pressed={enabled}
                disabled={busy || state === null || unavailable}
                onClick={() => void setEnabled(true)}
              >
                <MaterialIcon name="smart_toy" size="small" /> {t('settings.agentAccess.on')}
              </button>
            </div>
          </div>

          {unavailable && <p className="callout callout--info">{t('settings.agentAccess.unavailable')}</p>}

          {enabled && !unavailable && (
            <>
              <p className="callout callout--warning">{t('settings.agentAccess.warning')}</p>
              <div className="setting-item">
                <span className="setting-label">{t('settings.agentAccess.fileLabel')}</span>
                <code className="agent-access-path">{state?.discoveryFile}</code>
                <span className="setting-help">{t('settings.agentAccess.fileHelp')}</span>
                <div className="agent-access-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => void copyPath()}>
                    <MaterialIcon name={copied ? 'check' : 'content_copy'} size="small" />{' '}
                    {copied ? t('settings.agentAccess.copied') : t('settings.agentAccess.copyPath')}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="agent-access-actions">
            <button type="button" className="btn btn-ghost" onClick={openGuide}>
              <MaterialIcon name="menu_book" size="small" /> {t('settings.agentAccess.guide')}
            </button>
          </div>

          <p className="visually-hidden" role="status" aria-live="polite">
            {copied ? t('settings.agentAccess.copied') : ''}
          </p>
          {problem && <p className="callout callout--danger" role="alert">{problem}</p>}
        </div>
      )}
    </section>
  );
}
