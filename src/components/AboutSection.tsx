import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildInfo, formatCommit } from '../utils/buildInfo';
import { getApiBaseUrl } from '../utils/apiBase';
import { MaterialIcon } from './MaterialIcon';
import './AboutSection.css';

interface BackendInfo {
  version?: string;
  commit?: string;
  buildTime?: string | null;
  dependencies?: Record<string, string>;
}

type BackendStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; info: BackendInfo }
  | { state: 'unreachable'; error: string };

const COMMIT_URL_BASE = 'https://github.com/mbianchidev/fire-tools/commit/';

export const AboutSection: React.FC = () => {
  const { t } = useTranslation();
  const [backend, setBackend] = useState<BackendStatus>({ state: 'idle' });

  const loadBackend = async () => {
    setBackend({ state: 'loading' });
    try {
      const base = await getApiBaseUrl();
      if (!base) {
        setBackend({ state: 'unreachable', error: t('about.backendUnreachable') });
        return;
      }
      const res = await fetch(`${base}/health`);
      if (!res.ok) {
        setBackend({ state: 'unreachable', error: `HTTP ${res.status}` });
        return;
      }
      const info = (await res.json()) as BackendInfo;
      setBackend({ state: 'ok', info });
    } catch (err) {
      setBackend({ state: 'unreachable', error: (err as Error).message });
    }
  };

  useEffect(() => {
    void loadBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitShort = formatCommit(buildInfo.commit);
  const commitIsKnown = buildInfo.commit && buildInfo.commit !== 'unknown';
  const deps = Object.entries(buildInfo.dependencies);

  return (
    <div className="about-section">
      <div className="about-header">
        <MaterialIcon name="info" />
        <h3>{t('about.appInfo')}</h3>
      </div>

      <dl className="about-grid">
        <dt>{t('about.appVersion')}</dt>
        <dd data-testid="about-app-version">{buildInfo.version}</dd>

        <dt>{t('about.commit')}</dt>
        <dd data-testid="about-commit">
          {commitIsKnown ? (
            <a
              href={`${COMMIT_URL_BASE}${buildInfo.commit}`}
              target="_blank"
              rel="noopener noreferrer"
              title={buildInfo.commit}
            >
              <code>{commitShort}</code>
            </a>
          ) : (
            <code>{t('common.notAvailable')}</code>
          )}
        </dd>

        {buildInfo.buildTime && (
          <>
            <dt>{t('about.buildTime')}</dt>
            <dd data-testid="about-build-time">
              <code>{buildInfo.buildTime}</code>
            </dd>
          </>
        )}
      </dl>

      <div className="about-subheader">
        <MaterialIcon name="dns" />
        <h3>{t('about.backendInfo')}</h3>
        <button
          type="button"
          className="secondary-btn about-refresh-btn"
          onClick={() => void loadBackend()}
          disabled={backend.state === 'loading'}
        >
          <MaterialIcon name="refresh" /> {t('about.refresh')}
        </button>
      </div>

      {backend.state === 'loading' && (
        <p className="about-status">{t('common.loading')}</p>
      )}
      {backend.state === 'unreachable' && (
        <p className="about-status about-status-error" data-testid="about-backend-error">
          <MaterialIcon name="error" /> {backend.error}
        </p>
      )}
      {backend.state === 'ok' && (
        <dl className="about-grid">
          <dt>{t('about.backendVersion')}</dt>
          <dd data-testid="about-backend-version">{backend.info.version ?? t('common.notAvailable')}</dd>

          {backend.info.commit && (
            <>
              <dt>{t('about.commit')}</dt>
              <dd>
                {backend.info.commit !== 'unknown' ? (
                  <a
                    href={`${COMMIT_URL_BASE}${backend.info.commit}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={backend.info.commit}
                  >
                    <code>{formatCommit(backend.info.commit)}</code>
                  </a>
                ) : (
                  <code>{t('common.notAvailable')}</code>
                )}
              </dd>
            </>
          )}

          {backend.info.buildTime && (
            <>
              <dt>{t('about.buildTime')}</dt>
              <dd>
                <code>{backend.info.buildTime}</code>
              </dd>
            </>
          )}
        </dl>
      )}

      <div className="about-subheader">
        <MaterialIcon name="extension" />
        <h3>{t('about.dependencies')}</h3>
      </div>
      {deps.length === 0 ? (
        <p className="about-status">{t('common.notAvailable')}</p>
      ) : (
        <table className="about-deps-table" data-testid="about-dependencies">
          <thead>
            <tr>
              <th>{t('about.dependencyName')}</th>
              <th>{t('about.dependencyVersion')}</th>
            </tr>
          </thead>
          <tbody>
            {deps.map(([name, version]) => (
              <tr key={name}>
                <td><code>{name}</code></td>
                <td><code>{version}</code></td>
              </tr>
            ))}
            {backend.state === 'ok' && backend.info.dependencies
              ? Object.entries(backend.info.dependencies)
                  .filter(([name]) => !buildInfo.dependencies[name])
                  .map(([name, version]) => (
                    <tr key={`backend-${name}`}>
                      <td>
                        <code>{name}</code>{' '}
                        <span className="about-dep-tag">{t('about.backendDepTag')}</span>
                      </td>
                      <td><code>{version}</code></td>
                    </tr>
                  ))
              : null}
          </tbody>
        </table>
      )}
    </div>
  );
};
