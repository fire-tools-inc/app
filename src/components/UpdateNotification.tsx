import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdaterPrefs,
  getUpdaterState,
  installUpdate,
  subscribeUpdaterEvents,
  updaterBridgeAvailable,
  type UpdaterState,
} from '../utils/updater';
import './UpdateNotification.css';

/**
 * Persistent banner that surfaces auto-updater lifecycle events when the
 * Electron bridge is available. Hides itself entirely on non-Electron builds
 * and when the updater is disabled (dev mode, missing dependency, etc.).
 */
export default function UpdateNotification() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdaterState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!updaterBridgeAvailable()) return;
    setBridgeReady(true);

    let cancelled = false;
    const init = async () => {
      try {
        const initial = await getUpdaterState();
        if (!cancelled && mountedRef.current) setState(initial);

        const prefs = await getUpdaterPrefs();
        if (!cancelled && mountedRef.current && prefs?.autoCheck) {
          checkForUpdates().catch((err) => console.error('[fire-tools] update check failed:', err));
        }
      } catch (err) {
        console.error('[fire-tools] updater init failed:', err);
      }
    };
    void init();

    const unsubscribe = subscribeUpdaterEvents((event) => {
      if (!mountedRef.current) return;
      setState((prev) => {
        const base: UpdaterState = prev ?? {
          status: 'idle',
          error: null,
          info: null,
          progress: null,
          result: null,
        };
        return {
          status: event.status ?? base.status,
          error: event.error ?? base.error,
          info: event.info ?? base.info,
          progress: event.progress ?? base.progress,
          result: base.result,
        };
      });
      if (event.status === 'available') setDismissed(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleDownload = useCallback(async () => {
    setBusy(true);
    try {
      const next = await downloadUpdate();
      if (mountedRef.current) setState(next);
    } catch (err) {
      console.error('[fire-tools] downloadUpdate failed:', err);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, []);

  const handleInstall = useCallback(async () => {
    setBusy(true);
    try {
      await installUpdate();
    } catch (err) {
      console.error('[fire-tools] installUpdate failed:', err);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, []);

  const handleDismiss = useCallback(() => setDismissed(true), []);

  if (!bridgeReady || !state) return null;
  if (dismissed) return null;

  const { status, info, progress, error } = state;
  const version = info?.version ?? '';

  const renderBody = () => {
    switch (status) {
      case 'available':
        return (
          <>
            <span className="update-notification__title">
              {t('update.available.title', { defaultValue: 'Update available' })}
              {version ? ` — v${version}` : ''}
            </span>
            <span className="update-notification__message">
              {version
                ? t('update.available.message', {
                    version,
                    defaultValue: 'Version {{version}} is ready to download.',
                  })
                : t('update.available.messageNoVersion', {
                    defaultValue: 'A new version of Fire Tools is ready to download.',
                  })}
            </span>
            <div className="update-notification__actions">
              <button
                type="button"
                className="update-notification__btn update-notification__btn--primary"
                onClick={handleDownload}
                disabled={busy}
              >
                {t('update.actions.download', { defaultValue: 'Download' })}
              </button>
              <button
                type="button"
                className="update-notification__btn"
                onClick={handleDismiss}
                disabled={busy}
              >
                {t('update.actions.later', { defaultValue: 'Later' })}
              </button>
            </div>
          </>
        );
      case 'downloading': {
        const pct = progress?.percent != null ? Math.max(0, Math.min(100, Math.round(progress.percent))) : null;
        return (
          <>
            <span className="update-notification__title">
              {version
                ? t('update.downloading.title', { version, defaultValue: 'Downloading Fire Tools {{version}}…' })
                : t('update.downloading.titleNoVersion', { defaultValue: 'Downloading update…' })}
            </span>
            <div
              className="update-notification__progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
            >
              <div
                className="update-notification__progress-bar"
                style={{ width: pct != null ? `${pct}%` : '100%' }}
              />
            </div>
            <span className="update-notification__message">
              {pct != null
                ? t('update.downloading.percent', { percent: pct, defaultValue: '{{percent}}%' })
                : t('update.downloading.indeterminate', { defaultValue: 'Starting…' })}
            </span>
          </>
        );
      }
      case 'downloaded':
        return (
          <>
            <span className="update-notification__title">
              {t('update.downloaded.title', { defaultValue: 'Update ready to install' })}
              {version ? ` — v${version}` : ''}
            </span>
            <span className="update-notification__message">
              {version
                ? t('update.downloaded.message', {
                    version,
                    defaultValue: 'Restart to install version {{version}}. A backup will be taken first.',
                  })
                : t('update.downloaded.messageNoVersion', {
                    defaultValue: 'Restart now to apply. A backup will be created automatically.',
                  })}
            </span>
            <div className="update-notification__actions">
              <button
                type="button"
                className="update-notification__btn update-notification__btn--primary"
                onClick={handleInstall}
                disabled={busy}
              >
                {t('update.actions.install', { defaultValue: 'Install & Restart' })}
              </button>
              <button
                type="button"
                className="update-notification__btn"
                onClick={handleDismiss}
                disabled={busy}
              >
                {t('update.actions.later', { defaultValue: 'Later' })}
              </button>
            </div>
          </>
        );
      case 'backup-failed':
        return (
          <>
            <span className="update-notification__title">
              {t('update.backupFailed.title', { defaultValue: 'Pre-install backup failed' })}
            </span>
            <span className="update-notification__message">
              {t('update.backupFailed.message', {
                defaultValue:
                  'The update was aborted to keep your data safe. Check disk space and try again from Settings.',
              })}
            </span>
            <div className="update-notification__actions">
              <button
                type="button"
                className="update-notification__btn"
                onClick={handleDismiss}
                disabled={busy}
              >
                {t('update.actions.dismiss', { defaultValue: 'Dismiss' })}
              </button>
            </div>
          </>
        );
      case 'error':
        return (
          <>
            <span className="update-notification__title">
              {t('update.error.title', { defaultValue: 'Update error' })}
            </span>
            <span className="update-notification__message">{error ?? ''}</span>
            <div className="update-notification__actions">
              <button
                type="button"
                className="update-notification__btn"
                onClick={handleDismiss}
                disabled={busy}
              >
                {t('update.actions.dismiss', { defaultValue: 'Dismiss' })}
              </button>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const body = renderBody();
  if (!body) return null;

  return (
    <div
      className={`update-notification update-notification--${status}`}
      role="status"
      aria-live="polite"
    >
      <div className="update-notification__body">{body}</div>
    </div>
  );
}
