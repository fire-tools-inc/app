import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSyncStatus } from '../hooks/useBackendSync';
import {
  dismissRejectedChanges,
  resolveSyncConflicts,
  retrySync,
  type BackendSyncStatus,
  type RejectedChange,
  type SyncDomain,
} from '../utils/backendSync';
import { logger } from '../utils/logger';
import { MaterialIcon } from './MaterialIcon';
import './SyncStatus.css';

function useDomainNames(): (domains: readonly SyncDomain[]) => string {
  const { t } = useTranslation();
  return (domains) => domains.map((domain) => t(`sync.domains.${domain}`)).join(', ');
}

function rejectedLocation(change: RejectedChange): { collection: string; key: string } | null {
  const details = change.details;
  if (!details || typeof details !== 'object') return null;
  const { collection, key } = details as { collection?: unknown; key?: unknown };
  if (typeof collection !== 'string') return null;
  return { collection, key: key === undefined || key === null ? '' : String(key) };
}

function runAction(action: () => Promise<void>, event: string): void {
  action().catch((error: unknown) => {
    logger.error('backend-sync', event, 'A database sync action failed.', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
  });
}

function ConflictChoices({ status }: { status: BackendSyncStatus }) {
  const { t } = useTranslation();
  const names = useDomainNames();
  return (
    <div className="callout callout--warning sync-callout">
      <MaterialIcon name="sync_problem" />
      <div className="sync-callout__body">
        <p className="sync-callout__title">{t('sync.conflict.title')}</p>
        <p>{t('sync.conflict.message', { domains: names(status.conflicts) })}</p>
        <div className="sync-callout__actions">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={status.resolving}
            onClick={() => runAction(() => resolveSyncConflicts('database'), 'conflict-database-failed')}
          >
            {t('sync.conflict.useDatabase')}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={status.resolving}
            onClick={() => runAction(() => resolveSyncConflicts('device'), 'conflict-device-failed')}
          >
            {t('sync.conflict.useDevice')}
          </button>
        </div>
        {status.resolving && <p className="sync-callout__note">{t('sync.conflict.working')}</p>}
      </div>
    </div>
  );
}

function RejectedList({ changes, allowDismissEach }: { changes: readonly RejectedChange[]; allowDismissEach: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <ul className="sync-rejected-list">
      {changes.map((change) => {
        const location = rejectedLocation(change);
        return (
          <li key={change.id}>
            <div>
              <p className="sync-rejected-list__domain">{t(`sync.domains.${change.domain}`)}</p>
              <p>{change.message}</p>
              {location && (
                <p className="sync-rejected-list__meta">
                  {t('sync.rejected.location', { collection: location.collection, key: location.key })}
                </p>
              )}
              <p className="sync-rejected-list__meta">
                {t('sync.rejected.when', { time: new Date(change.createdAt).toLocaleString(i18n.language) })}
              </p>
            </div>
            {allowDismissEach && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => dismissRejectedChanges(change.id)}
                aria-label={t('sync.rejected.dismissOne', { domain: t(`sync.domains.${change.domain}`) })}
              >
                {t('sync.rejected.dismiss')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RejectedCallout({ status }: { status: BackendSyncStatus }) {
  const { t } = useTranslation();
  return (
    <div className="callout callout--danger sync-callout">
      <MaterialIcon name="error" />
      <div className="sync-callout__body">
        <p className="sync-callout__title">{t('sync.rejected.title', { count: status.rejected.length })}</p>
        <p>{t('sync.rejected.message')}</p>
        <details className="sync-callout__details">
          <summary>{t('sync.rejected.showDetails')}</summary>
          <RejectedList changes={status.rejected} allowDismissEach={false} />
        </details>
        <div className="sync-callout__actions">
          <button type="button" className="btn btn--secondary" onClick={() => dismissRejectedChanges()}>
            {t('sync.rejected.dismissAll')}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssuesCallout({ status }: { status: BackendSyncStatus }) {
  const { t } = useTranslation();
  return (
    <div className="callout callout--danger sync-callout">
      <MaterialIcon name="cloud_off" />
      <div className="sync-callout__body">
        <ul className="sync-issue-list">
          {status.issues.map((issue) => (
            <li key={issue.domain}>
              {t(`sync.issues.${issue.kind}`, { domain: t(`sync.domains.${issue.domain}`), message: issue.message })}
            </li>
          ))}
        </ul>
        <div className="sync-callout__actions">
          <button type="button" className="btn btn--secondary" onClick={() => runAction(retrySync, 'retry-failed')}>
            {t('sync.status.retry')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Non-blocking app-level banner for conflicts, rejected changes and start-up problems. */
export function SyncBanner({ dataEpoch }: { dataEpoch: number }) {
  const { t } = useTranslation();
  const status = useSyncStatus();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (dataEpoch > 0) setAnnouncement(t('sync.updated'));
  }, [dataEpoch, t]);

  const hasConflicts = status.conflicts.length > 0;
  const hasRejected = status.rejected.length > 0;
  const hasIssues = status.issues.length > 0;

  return (
    <>
      <div className="visually-hidden" role="status" aria-live="polite">{announcement}</div>
      {(hasConflicts || hasRejected || hasIssues) && (
        <section className="sync-banner" aria-label={t('sync.bannerLabel')}>
          {hasConflicts && <ConflictChoices status={status} />}
          {hasRejected && <RejectedCallout status={status} />}
          {hasIssues && <IssuesCallout status={status} />}
        </section>
      )}
    </>
  );
}

function statusLine(status: BackendSyncStatus, t: TFunction): { icon: string; text: string; tone: string } {
  if (status.conflicts.length > 0 && (status.state === 'saved' || status.state === 'saving')) {
    return { icon: 'sync_problem', text: t('sync.status.needsChoice'), tone: 'warning' };
  }
  switch (status.state) {
    case 'starting':
      return { icon: 'sync', text: t('sync.status.starting'), tone: 'neutral' };
    case 'saving':
      return { icon: 'sync', text: t('sync.status.saving', { count: status.pending }), tone: 'neutral' };
    case 'offline':
      return status.pending > 0
        ? { icon: 'cloud_off', text: t('sync.status.offlinePending', { count: status.pending }), tone: 'warning' }
        : { icon: 'cloud_off', text: t('sync.status.offline'), tone: 'warning' };
    case 'unauthorized':
      return { icon: 'key_off', text: t('sync.status.unauthorized'), tone: 'danger' };
    case 'saved':
    default:
      return { icon: 'cloud_done', text: t('sync.status.saved'), tone: 'success' };
  }
}

/** Compact sync status for Settings > Data. Hidden when data stays on this device only. */
export function SyncStatusPanel() {
  const { t, i18n } = useTranslation();
  const status = useSyncStatus();
  if (status.state === 'disabled' && !status.rejected.length && !status.conflicts.length) return null;

  const line = statusLine(status, t);
  const canRetry = status.state === 'offline' || status.state === 'unauthorized' || status.issues.length > 0;

  return (
    <div className="data-management-group sync-status-panel">
      <h3>{t('sync.status.title')}</h3>
      <p className="setting-help">{t('sync.status.description')}</p>
      <p className={`sync-status-line sync-status-line--${line.tone}`}>
        <MaterialIcon name={line.icon} size="small" />
        <span>{line.text}</span>
      </p>
      {status.lastSavedAt !== null && (
        <p className="setting-help">
          {t('sync.status.lastSaved', { time: new Date(status.lastSavedAt).toLocaleTimeString(i18n.language) })}
        </p>
      )}
      {canRetry && (
        <div className="sync-callout__actions">
          <button type="button" className="btn btn--secondary" onClick={() => runAction(retrySync, 'retry-failed')}>
            {t('sync.status.retry')}
          </button>
        </div>
      )}
      {status.conflicts.length > 0 && <ConflictChoices status={status} />}
      {status.issues.length > 0 && (
        <ul className="sync-issue-list">
          {status.issues.map((issue) => (
            <li key={issue.domain}>
              {t(`sync.issues.${issue.kind}`, { domain: t(`sync.domains.${issue.domain}`), message: issue.message })}
            </li>
          ))}
        </ul>
      )}
      {status.rejected.length > 0 && (
        <div className="sync-rejected">
          <p className="sync-callout__title">{t('sync.rejected.title', { count: status.rejected.length })}</p>
          <p className="setting-help">{t('sync.rejected.message')}</p>
          <RejectedList changes={status.rejected} allowDismissEach />
          <div className="sync-callout__actions">
            <button type="button" className="btn btn--secondary" onClick={() => dismissRejectedChanges()}>
              {t('sync.rejected.dismissAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
