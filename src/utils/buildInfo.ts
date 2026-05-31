/**
 * Build metadata injected at compile time by Vite (see `vite.config.ts`).
 * Values fall back gracefully when the corresponding global is undefined
 * (e.g. when running unit tests that haven't gone through the Vite build).
 */

const safeRead = <T>(value: T | undefined, fallback: T): T =>
  value === undefined || value === null ? fallback : value;

export interface BuildInfo {
  version: string;
  commit: string;
  buildTime: string;
  dependencies: Record<string, string>;
  repoUrl: string;
}

const readGlobal = <T>(name: string, fallback: T): T => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (globalThis as any)[name];
    return safeRead<T>(value as T | undefined, fallback);
  } catch {
    return fallback;
  }
};

export const buildInfo: BuildInfo = {
  version:
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : readGlobal('__APP_VERSION__', '0.0.0'),
  commit:
    typeof __APP_COMMIT_HASH__ !== 'undefined'
      ? __APP_COMMIT_HASH__
      : readGlobal('__APP_COMMIT_HASH__', 'unknown'),
  buildTime:
    typeof __APP_BUILD_TIME__ !== 'undefined'
      ? __APP_BUILD_TIME__
      : readGlobal('__APP_BUILD_TIME__', ''),
  dependencies:
    typeof __APP_DEPENDENCIES__ !== 'undefined'
      ? __APP_DEPENDENCIES__
      : readGlobal<Record<string, string>>('__APP_DEPENDENCIES__', {}),
  repoUrl:
    typeof __APP_REPO_URL__ !== 'undefined'
      ? __APP_REPO_URL__
      : readGlobal('__APP_REPO_URL__', ''),
};

export const formatCommit = (commit: string): string => {
  if (!commit || commit === 'unknown') return commit || 'unknown';
  return commit.length > 7 ? commit.slice(0, 7) : commit;
};

/**
 * Build a URL to a commit on the host where the repo lives.
 * Supports GitHub, GitLab and Bitbucket URL shapes; returns `null` if we
 * don't know enough to construct a stable link.
 */
export const buildCommitUrl = (
  repoUrl: string,
  commit: string,
): string | null => {
  if (!repoUrl || !commit || commit === 'unknown') return null;
  const base = repoUrl.replace(/\/+$/, '');
  if (/bitbucket\.org/i.test(base)) return `${base}/commits/${commit}`;
  // Default to the GitHub / GitLab shape (both use /commit/<sha>).
  return `${base}/commit/${commit}`;
};
