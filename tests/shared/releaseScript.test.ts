// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const releaseScript = resolve('scripts/release.sh');
const bumpScript = resolve('scripts/bump-version.mjs');
const expectedChecks = [
  'ci',
  '--prefix server ci',
  'audit',
  '--prefix server audit',
  'test',
  '--prefix server test',
  'exec -- playwright install chromium',
  'run test:browser',
  'run build',
  'run electron:build',
];
const versionFiles = [
  'package.json', 'package-lock.json', 'server/package.json',
  'server/package-lock.json', 'tests/setup.ts',
];
let directory: string;
let project: string;
let remote: string;
let environment: NodeJS.ProcessEnv;
let originalCommit: string;
let commandLog: string;

function git(args: string[], cwd = project): string {
  return execFileSync('git', args, { cwd, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function remoteRef(ref: string): string | null {
  const result = spawnSync('git', ['--git-dir', remote, 'rev-parse', '--verify', ref], {
    env: environment, encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function run(args: string[] = [], overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.platform === 'darwin' ? '/bin/bash' : 'bash', ['scripts/release.sh', ...args], {
    cwd: project,
    env: { ...environment, ...overrides },
    encoding: 'utf8',
    timeout: 20000,
  });
}

function commands(): string[] {
  return existsSync(commandLog) ? readFileSync(commandLog, 'utf8').trim().split('\n') : [];
}

function commitFixtureChange(path: string, content: string): void {
  writeFileSync(join(project, path), content);
  git(['add', '--', path]);
  git(['commit', '--no-gpg-sign', '-qm', 'Synthetic fixture change']);
  git(['push', '-q', 'origin', 'HEAD:main']);
  originalCommit = git(['rev-parse', 'HEAD']);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'fire-tools-release-test-'));
  project = join(directory, 'project');
  remote = join(directory, 'remote.git');
  commandLog = join(directory, 'npm-commands.log');
  const bin = join(directory, 'bin');
  const template = join(directory, 'empty-template');
  const gitConfig = join(directory, 'empty-gitconfig');
  mkdirSync(bin);
  mkdirSync(template);
  mkdirSync(project);
  environment = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TEMPLATE_DIR: template,
    GIT_AUTHOR_NAME: 'Synthetic release test',
    GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic release test',
    GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
    RELEASE_COMMAND_LOG: commandLog,
    RELEASE_REMOTE: remote,
  };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete environment[key];
  writeFileSync(gitConfig, '');
  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$RELEASE_COMMAND_LOG"
if [[ "$*" == "\${RELEASE_FAIL_COMMAND:-}" ]]; then
  echo "Synthetic validation failure" >&2
  exit 17
fi
if [[ "$*" == 'run electron:build' ]]; then
  if [[ "\${RELEASE_MUTATE_UNRELATED:-}" == '1' ]]; then
    printf 'Synthetic unrelated edit\\n' > unexpected.txt
  fi
  if [[ "\${RELEASE_MUTATE_VERSION_FILE:-}" == '1' ]]; then
    node -e 'const fs = require("node:fs"); const file = "server/package-lock.json"; const data = JSON.parse(fs.readFileSync(file, "utf8")); data.syntheticDependency = "unvalidated"; fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\\n");'
  fi
  if [[ -n "\${RELEASE_CONCURRENT_COMMIT:-}" ]]; then
    git --git-dir="$RELEASE_REMOTE" update-ref refs/heads/main "$RELEASE_CONCURRENT_COMMIT"
  fi
fi
`, { mode: 0o755 });
  git(['init', '--bare', '-q', remote], directory);
  git(['init', '-q', '-b', 'main']);
  for (const subdirectory of ['scripts', 'server', 'tests']) mkdirSync(join(project, subdirectory));
  copyFileSync(releaseScript, join(project, 'scripts/release.sh'));
  copyFileSync(bumpScript, join(project, 'scripts/bump-version.mjs'));
  for (const prefix of ['', 'server/']) {
    writeFileSync(join(project, prefix, 'package.json'), JSON.stringify({
      name: 'synthetic-release', version: '1.2.3', private: true, type: 'module',
    }, null, 2) + '\n');
    writeFileSync(join(project, prefix, 'package-lock.json'), JSON.stringify({
      name: 'synthetic-release', version: '1.2.3', lockfileVersion: 3,
      packages: { '': { name: 'synthetic-release', version: '1.2.3' } },
    }, null, 2) + '\n');
  }
  writeFileSync(join(project, 'tests/setup.ts'), "vi.stubGlobal('__APP_VERSION__', '1.2.3');\n");
  git(['add', '.']);
  git(['commit', '--no-gpg-sign', '-qm', 'Synthetic initial commit']);
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-q', 'origin', 'HEAD:main']);
  originalCommit = git(['rev-parse', 'HEAD']);
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('one-command release script', () => {
  it('bumps an explicit tag, validates locally, and publishes an atomic matching commit and tag', () => {
    const result = run(['v1.3.0']);
    expect(result.status, result.stderr).toBe(0);
    expect(commands()).toEqual(expectedChecks);
    for (const file of versionFiles.filter(file => file.endsWith('.json'))) {
      const payload = JSON.parse(readFileSync(join(project, file), 'utf8'));
      expect(payload.version).toBe('1.3.0');
      if (file.endsWith('package-lock.json')) expect(payload.packages[''].version).toBe('1.3.0');
    }
    expect(readFileSync(join(project, 'tests/setup.ts'), 'utf8')).toContain("'1.3.0'");
    const commit = git(['rev-parse', 'HEAD']);
    expect(commit).not.toBe(originalCommit);
    expect(remoteRef('refs/heads/main')).toBe(commit);
    expect(remoteRef('refs/tags/v1.3.0^{}')).toBe(commit);
    expect(git(['cat-file', '-t', 'refs/tags/v1.3.0'])).toBe('tag');
    expect(git(['show', '--format=', '--name-only', 'HEAD']).split('\n').sort()).toEqual([...versionFiles].sort());
    expect(git(['log', '-1', '--format=%B'])).toBe('chore: bump version to 1.3.0');
    expect(git(['status', '--porcelain'])).toBe('');
    expect(result.stdout).toContain('GitHub Actions will');
    expect(result.stdout).toContain('publish');
    expect(result.stdout).toContain('/actions/workflows/release.yml');
  });

  it('keeps no-argument releases of an already committed version without creating another commit', () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(commands()).toEqual(expectedChecks);
    expect(git(['rev-parse', 'HEAD'])).toBe(originalCommit);
    expect(remoteRef('refs/tags/v1.2.3^{}')).toBe(originalCommit);
  });

  it('does not depend on interactive signing settings or introduce attribution trailers', () => {
    git(['config', 'commit.gpgsign', 'true']);
    git(['config', 'tag.gpgsign', 'true']);
    git(['config', 'gpg.program', join(directory, 'missing-signing-program')]);
    const result = run(['v1.3.0']);
    expect(result.status, result.stderr).toBe(0);
    expect(git(['log', '-1', '--format=%B'])).toBe('chore: bump version to 1.3.0');
    expect(git(['cat-file', 'tag', 'v1.3.0'])).not.toContain('BEGIN PGP SIGNATURE');
  });

  it.each([
    { args: ['--bump'], version: '1.3.0' },
    { args: ['--bump', '2.0.0'], version: '2.0.0' },
  ])('preserves the existing $args bump interface', ({ args, version }) => {
    const result = run(args);
    expect(result.status, result.stderr).toBe(0);
    expect(remoteRef(`refs/tags/v${version}^{}`)).toBe(git(['rev-parse', 'HEAD']));
  });

  it.each([
    ['v1.3'], ['v01.3.0'], ['v1.3.0-extra'], ['v1.3.0', '--bump'],
    ['v1.3.0', 'v1.4.0'], ['--bump', 'not-a-version'],
  ])('rejects invalid or conflicting input %j without changing refs or versions', args => {
    const result = run(args);
    expect(result.status).not.toBe(0);
    expect(commands()).toEqual([]);
    expect(git(['status', '--porcelain'])).toBe('');
    expect(remoteRef('refs/heads/main')).toBe(originalCommit);
  });

  it('refuses to release a downgrade', () => {
    const result = run(['v1.2.2']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('older');
    expect(commands()).toEqual([]);
    expect(git(['status', '--porcelain'])).toBe('');
  });

  it('requires a clean main checkout without switching branches', () => {
    git(['switch', '-q', '-c', 'synthetic-feature']);
    expect(run(['v1.3.0']).status).not.toBe(0);
    expect(git(['branch', '--show-current'])).toBe('synthetic-feature');
    git(['switch', '-q', 'main']);
    writeFileSync(join(project, 'unrelated.txt'), 'Synthetic unsaved edit');
    expect(run(['v1.3.0']).status).not.toBe(0);
    expect(readFileSync(join(project, 'unrelated.txt'), 'utf8')).toBe('Synthetic unsaved edit');
    expect(commands()).toEqual([]);
  });

  it('refuses an existing remote tag before bumping or installing', () => {
    git(['tag', '-a', 'v1.3.0', '-m', 'Synthetic existing tag']);
    git(['push', '-q', 'origin', 'refs/tags/v1.3.0']);
    git(['tag', '-d', 'v1.3.0']);
    const existingTag = remoteRef('refs/tags/v1.3.0');
    const result = run(['v1.3.0']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists');
    expect(remoteRef('refs/tags/v1.3.0')).toBe(existingTag);
    expect(git(['status', '--porcelain'])).toBe('');
    expect(commands()).toEqual([]);
  });

  it.each(['ci', '--prefix server audit', 'test', '--prefix server test', 'run test:browser', 'run build', 'run electron:build'])(
    'does not commit or push when %s fails',
    failedCommand => {
      const result = run(['v1.3.0'], { RELEASE_FAIL_COMMAND: failedCommand });
      expect(result.status).toBe(17);
      expect(commands()).toEqual(expectedChecks.slice(0, expectedChecks.indexOf(failedCommand) + 1));
      expect(git(['rev-parse', 'HEAD'])).toBe(originalCommit);
      expect(remoteRef('refs/heads/main')).toBe(originalCommit);
      expect(remoteRef('refs/tags/v1.3.0')).toBeNull();
      expect(git(['tag', '--list', 'v1.3.0'])).toBe('');
      expect(readFileSync(join(project, 'package.json'), 'utf8')).toContain('1.3.0');
      expect(result.stderr).toContain('failed');
    },
  );

  it('does not stage unrelated changes introduced during validation', () => {
    const result = run(['v1.3.0'], { RELEASE_MUTATE_UNRELATED: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected.txt');
    expect(git(['diff', '--cached', '--name-only'])).toBe('');
    expect(remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(remoteRef('refs/tags/v1.3.0')).toBeNull();
  });

  it('does not publish a version file modified after its checks', () => {
    const result = run(['v1.3.0'], { RELEASE_MUTATE_VERSION_FILE: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Tracked files changed');
    expect(remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(remoteRef('refs/tags/v1.3.0')).toBeNull();
    expect(git(['diff', '--cached', '--name-only'])).toBe('');
  });

  it('does not publish changes added by a commit hook after validation', () => {
    commitFixtureChange('synthetic.txt', 'Synthetic validated source\n');
    const hooks = join(project, '.git/hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-commit'), `#!/usr/bin/env bash
set -euo pipefail
printf 'Synthetic unvalidated source\\n' >> synthetic.txt
git add -- synthetic.txt
`, { mode: 0o755 });
    const result = run(['v1.3.0']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('commit hook');
    expect(remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(remoteRef('refs/tags/v1.3.0')).toBeNull();
  });

  it('rechecks main after local validation and does not tag a stale branch', () => {
    const tree = git(['rev-parse', 'HEAD^{tree}']);
    const concurrentCommit = git(['commit-tree', tree, '-p', originalCommit, '-m', 'Synthetic concurrent change']);
    git(['push', '-q', 'origin', `${concurrentCommit}:refs/heads/synthetic-concurrent`]);
    const result = run(['v1.3.0'], { RELEASE_CONCURRENT_COMMIT: concurrentCommit });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('main');
    expect(remoteRef('refs/heads/main')).toBe(concurrentCommit);
    expect(remoteRef('refs/tags/v1.3.0')).toBeNull();
    expect(git(['rev-parse', 'HEAD'])).toBe(originalCommit);
  });

  it.each(['tag', 'main'])('does not publish either ref when the remote rejects %s', rejectedRef => {
    mkdirSync(join(remote, 'hooks'), { recursive: true });
    writeFileSync(join(remote, 'hooks/update'), `#!/usr/bin/env bash
if [[ "$1" == ${rejectedRef === 'tag' ? 'refs/tags/*' : 'refs/heads/main'} ]]; then
  echo "Synthetic ref rejection" >&2
  exit 1
fi
`, { mode: 0o755 });
    const result = run(['v1.3.0']);
    expect(result.status).not.toBe(0);
    expect(remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(remoteRef('refs/tags/v1.3.0')).toBeNull();
    expect(git(['rev-parse', 'HEAD'])).not.toBe(originalCommit);
    expect(git(['tag', '--list', 'v1.3.0'])).toBe('v1.3.0');
    expect(result.stderr).toContain('atomic');
  });

  it('fails if a precommitted release has inconsistent package or test versions', () => {
    commitFixtureChange('server/package.json', JSON.stringify({ version: '0.0.0' }) + '\n');
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('server/package.json');
    expect(commands()).toEqual([]);
    expect(remoteRef('refs/tags/v1.2.3')).toBeNull();
  });

  it('does not confuse a failed remote connection with an available release tag', () => {
    git(['remote', 'set-url', 'origin', join(directory, 'missing-remote.git')]);
    const result = run(['v1.3.0']);
    expect(result.status).not.toBe(0);
    expect(commands()).toEqual([]);
    expect(git(['status', '--porcelain'])).toBe('');
    expect(git(['tag', '--list', 'v1.3.0'])).toBe('');
    expect(remoteRef('refs/heads/main')).toBe(originalCommit);
  });
});
