// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const releaseScript = resolve('scripts/release.sh');
const bumpScript = resolve('scripts/bump-version.mjs');
const versionScript = resolve('scripts/release-version.mjs');
const autoReleaseScript = resolve('scripts/auto-release.sh');
const fixtureShell = process.platform === 'darwin' ? '/bin/bash' : '/usr/bin/env bash';
// Hang guard, not a performance budget: a full synthetic release takes a few
// seconds, but the release script runs this suite on a fully loaded host.
const commandTimeout = 60000;
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
let template: string;
let directory: string;
let project: string;
let remote: string;
let environment: NodeJS.ProcessEnv;
let originalCommit: string;
let commandLog: string;
const processes = new Map<ChildProcess, Promise<void>>();

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

function execute(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const child = spawn(executable, args, {
    cwd, env, timeout: commandTimeout, stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.set(child, new Promise(resolve => child.once('close', () => {
    processes.delete(child);
    resolve();
  })));
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status, signal) => {
      if (signal || status === null) {
        reject(new Error(`${executable} ${args.join(' ')} did not exit normally (${signal ?? 'missing exit code'}).\n${stderr}`));
        return;
      }
      resolve({ status, stdout, stderr });
    });
  });
}

async function git(args: string[], cwd = project): Promise<string> {
  const result = await execute('git', args, cwd, environment);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} exited ${result.status}.\n${result.stderr}`);
  return result.stdout.trim();
}

async function remoteRef(ref: string): Promise<string | null> {
  const result = await execute('git', ['--git-dir', remote, 'rev-parse', '--verify', ref], project, environment);
  return result.status === 0 ? result.stdout.trim() : null;
}

function run(args: string[] = [], overrides: NodeJS.ProcessEnv = {}) {
  return execute(process.platform === 'darwin' ? '/bin/bash' : 'bash', ['scripts/release.sh', ...args],
    project, { ...environment, ...overrides });
}

function runAutomatic(before: string, source = originalCommit, overrides: NodeJS.ProcessEnv = {}) {
  writeFileSync(join(directory, 'github-output'), '');
  return execute(process.platform === 'darwin' ? '/bin/bash' : 'bash', ['scripts/auto-release.sh'],
    project, {
      ...environment,
      GITHUB_ACTIONS: 'true',
      GITHUB_OUTPUT: join(directory, 'github-output'),
      RELEASE_BEFORE: before,
      RELEASE_SOURCE: source,
      ...overrides,
    });
}

function releaseOutput(): string {
  return readFileSync(join(directory, 'github-output'), 'utf8').trim();
}

function commands(): string[] {
  return existsSync(commandLog) ? readFileSync(commandLog, 'utf8').trim().split('\n') : [];
}

async function commitFixtureChange(path: string, content: string): Promise<void> {
  writeFileSync(join(project, path), content);
  await git(['add', '--', path]);
  await git(['commit', '--no-gpg-sign', '-qm', 'Synthetic fixture change']);
  await git(['push', '-q', 'origin', 'HEAD:main']);
  originalCommit = await git(['rev-parse', 'HEAD']);
}

async function commitFixtureVersion(version: string): Promise<void> {
  const result = await execute(process.execPath, ['scripts/bump-version.mjs', version], project, environment);
  expect(result.status, result.stderr).toBe(0);
  await git(['add', '--', ...versionFiles]);
  await git(['commit', '--no-gpg-sign', '-qm', `Synthetic version ${version}`]);
  await git(['push', '-q', 'origin', 'HEAD:main']);
  originalCommit = await git(['rev-parse', 'HEAD']);
}

async function publishFixtureTag(version: string): Promise<void> {
  await git(['-c', 'tag.gpgSign=false', 'tag', '-a', `v${version}`, '-m', `Synthetic release ${version}`]);
  await git(['push', '-q', 'origin', `refs/tags/v${version}`]);
}

function prepareDirectory(root: string): void {
  directory = root;
  project = join(directory, 'project');
  remote = join(directory, 'remote.git');
  commandLog = join(directory, 'npm-commands.log');
  const bin = join(directory, 'bin');
  const gitTemplate = join(directory, 'empty-template');
  const gitConfig = join(directory, 'empty-gitconfig');
  mkdirSync(bin, { recursive: true });
  mkdirSync(gitTemplate, { recursive: true });
  mkdirSync(project, { recursive: true });
  environment = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TEMPLATE_DIR: gitTemplate,
    GIT_AUTHOR_NAME: 'Synthetic release test',
    GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
    GIT_COMMITTER_NAME: 'Synthetic release test',
    GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
    RELEASE_COMMAND_LOG: commandLog,
    RELEASE_REMOTE: remote,
  };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete environment[key];
  writeFileSync(gitConfig, '');
  writeFileSync(join(bin, 'npm'), `#!${fixtureShell}
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
}

// Build the synthetic repository once; each test gets an independent copy.
beforeAll(async () => {
  template = mkdtempSync(join(tmpdir(), 'fire-tools-release-template-'));
  prepareDirectory(template);
  await git(['init', '--bare', '-q', remote], directory);
  await git(['init', '-q', '-b', 'main']);
  for (const subdirectory of ['scripts', 'server', 'tests']) mkdirSync(join(project, subdirectory));
  copyFileSync(releaseScript, join(project, 'scripts/release.sh'));
  copyFileSync(bumpScript, join(project, 'scripts/bump-version.mjs'));
  copyFileSync(versionScript, join(project, 'scripts/release-version.mjs'));
  copyFileSync(autoReleaseScript, join(project, 'scripts/auto-release.sh'));
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
  await git(['add', '.']);
  await git(['commit', '--no-gpg-sign', '-qm', 'Synthetic initial commit']);
  // Relative so copies of the template push to their own remote.
  await git(['remote', 'add', 'origin', '../remote.git']);
  await git(['push', '-q', 'origin', 'HEAD:main']);
}, commandTimeout);

afterAll(() => {
  if (template) rmSync(template, { recursive: true, force: true });
});

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fire-tools-release-test-'));
  cpSync(join(template, 'project'), join(root, 'project'), { recursive: true });
  cpSync(join(template, 'remote.git'), join(root, 'remote.git'), { recursive: true });
  prepareDirectory(root);
  originalCommit = await git(['rev-parse', 'HEAD']);
}, commandTimeout);

afterEach(async () => {
  await Promise.all([...processes].map(([child, closed]) => {
    child.kill('SIGTERM');
    return closed;
  }));
  rmSync(directory, { recursive: true, force: true });
});

describe('one-command release script', { timeout: commandTimeout + 30000 }, () => {
  it('rejects a command that cannot start instead of treating it as a release rejection', async () => {
    await expect(execute(join(directory, 'missing-command'), [], project, environment)).rejects.toThrow('ENOENT');
  });

  it.skipIf(process.platform === 'win32')('rejects signal termination instead of treating it as a normal nonzero exit', async () => {
    await expect(execute(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")'], project, environment))
      .rejects.toThrow('did not exit normally (SIGTERM)');
  });

  it('bumps an explicit tag, validates locally, and publishes an atomic matching commit and tag', async () => {
    const result = await run(['v1.3.0']);
    expect(result.status, result.stderr).toBe(0);
    expect(commands()).toEqual(expectedChecks);
    for (const file of versionFiles.filter(file => file.endsWith('.json'))) {
      const payload = JSON.parse(readFileSync(join(project, file), 'utf8'));
      expect(payload.version).toBe('1.3.0');
      if (file.endsWith('package-lock.json')) expect(payload.packages[''].version).toBe('1.3.0');
    }
    expect(readFileSync(join(project, 'tests/setup.ts'), 'utf8')).toContain("'1.3.0'");
    const commit = await git(['rev-parse', 'HEAD']);
    expect(commit).not.toBe(originalCommit);
    expect(await remoteRef('refs/heads/main')).toBe(commit);
    expect(await remoteRef('refs/tags/v1.3.0^{}')).toBe(commit);
    expect(await git(['cat-file', '-t', 'refs/tags/v1.3.0'])).toBe('tag');
    expect((await git(['show', '--format=', '--name-only', 'HEAD'])).split('\n').sort()).toEqual([...versionFiles].sort());
    expect(await git(['log', '-1', '--format=%B'])).toBe('chore: bump version to 1.3.0');
    expect(await git(['status', '--porcelain'])).toBe('');
    expect(result.stdout).toContain('GitHub Actions will');
    expect(result.stdout).toContain('publish');
    expect(result.stdout).toContain('/actions/workflows/release.yml');
  });

  it('keeps no-argument releases of an already committed version without creating another commit', async () => {
    const result = await run();
    expect(result.status, result.stderr).toBe(0);
    expect(commands()).toEqual(expectedChecks);
    expect(await git(['rev-parse', 'HEAD'])).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v1.2.3^{}')).toBe(originalCommit);
  });

  it('does not depend on interactive signing settings or introduce attribution trailers', async () => {
    await git(['config', 'commit.gpgsign', 'true']);
    await git(['config', 'tag.gpgsign', 'true']);
    await git(['config', 'gpg.program', join(directory, 'missing-signing-program')]);
    const result = await run(['v1.3.0']);
    expect(result.status, result.stderr).toBe(0);
    expect(await git(['log', '-1', '--format=%B'])).toBe('chore: bump version to 1.3.0');
    expect(await git(['cat-file', 'tag', 'v1.3.0'])).not.toContain('BEGIN PGP SIGNATURE');
  });

  it.each([
    { args: ['--bump'], version: '1.3.0' },
    { args: ['--bump', '2.0.0'], version: '2.0.0' },
  ])('preserves the existing $args bump interface', async ({ args, version }) => {
    const result = await run(args);
    expect(result.status, result.stderr).toBe(0);
    expect(await remoteRef(`refs/tags/v${version}^{}`)).toBe(await git(['rev-parse', 'HEAD']));
  });

  it.each([
    { args: ['v1.3'], message: 'not a valid stable tag' },
    { args: ['v01.3.0'], message: 'not a valid stable tag' },
    { args: ['v1.3.0-extra'], message: 'not a valid stable tag' },
    { args: ['v1.3.0', '--bump'], message: 'Specify only one release tag' },
    { args: ['v1.3.0', 'v1.4.0'], message: 'Specify only one release tag' },
    { args: ['--bump', 'not-a-version'], message: 'not a valid stable version' },
  ])('rejects invalid or conflicting input $args without changing refs or versions', async ({ args, message }) => {
    const result = await run(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(commands()).toEqual([]);
    expect(await git(['status', '--porcelain'])).toBe('');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
  });

  it('refuses to release a downgrade', async () => {
    const result = await run(['v1.2.2']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('older');
    expect(commands()).toEqual([]);
    expect(await git(['status', '--porcelain'])).toBe('');
  });

  it('releases 2.4.1 after 2.4.0 even when unpublished package bumps reached 2.4.3', async () => {
    await commitFixtureVersion('2.4.0');
    await publishFixtureTag('2.4.0');
    await commitFixtureVersion('2.4.3');

    const result = await run(['v2.4.1']);

    expect(result.status, result.stderr).toBe(0);
    expect(commands()).toEqual(expectedChecks);
    for (const file of versionFiles.filter(file => file.endsWith('.json'))) {
      const payload = JSON.parse(readFileSync(join(project, file), 'utf8'));
      expect(payload.version).toBe('2.4.1');
      if (file.endsWith('package-lock.json')) expect(payload.packages[''].version).toBe('2.4.1');
    }
    expect(readFileSync(join(project, 'tests/setup.ts'), 'utf8')).toContain("'2.4.1'");
    const commit = await git(['rev-parse', 'HEAD']);
    expect(await remoteRef('refs/heads/main')).toBe(commit);
    expect(await remoteRef('refs/tags/v2.4.1^{}')).toBe(commit);
    expect(await git(['status', '--porcelain'])).toBe('');
  });

  it('still refuses a version older than an existing stable release tag', async () => {
    await publishFixtureTag('1.2.3');
    await commitFixtureVersion('1.2.6');

    const result = await run(['v1.2.2']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('release tag v1.2.3');
    expect(commands()).toEqual([]);
    expect(await git(['status', '--porcelain'])).toBe('');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
  });

  it('compares stable release versions numerically rather than lexicographically', async () => {
    await publishFixtureTag('1.2.3');
    await commitFixtureVersion('1.10.0');
    await publishFixtureTag('1.10.0');
    await commitFixtureVersion('1.10.3');

    const result = await run(['v1.9.9']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('release tag v1.10.0');
    expect(commands()).toEqual([]);
    expect(await git(['status', '--porcelain'])).toBe('');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v1.9.9')).toBeNull();
  });

  it('ignores retained local-only tags when deciding the latest released version', async () => {
    await publishFixtureTag('1.2.3');
    await git(['-c', 'tag.gpgSign=false', 'tag', '-a', 'v9.0.0', '-m', 'Synthetic failed release']);

    const result = await run(['v1.2.4']);

    expect(result.status, result.stderr).toBe(0);
    expect(await remoteRef('refs/tags/v1.2.4^{}')).toBe(await git(['rev-parse', 'HEAD']));
    expect(await remoteRef('refs/tags/v9.0.0')).toBeNull();
    expect(await git(['tag', '--list', 'v9.0.0'])).toBe('v9.0.0');
  });

  it('does not mistake a prerelease tag for a newer stable release', async () => {
    await publishFixtureTag('1.2.3');
    await publishFixtureTag('9.0.0-beta.1');
    await commitFixtureVersion('1.2.6');

    const result = await run(['v1.2.4']);

    expect(result.status, result.stderr).toBe(0);
    expect(await remoteRef('refs/tags/v1.2.4^{}')).toBe(await git(['rev-parse', 'HEAD']));
  });

  it('requires a clean main checkout without switching branches', async () => {
    await git(['switch', '-q', '-c', 'synthetic-feature']);
    expect((await run(['v1.3.0'])).status).not.toBe(0);
    expect(await git(['branch', '--show-current'])).toBe('synthetic-feature');
    await git(['switch', '-q', 'main']);
    writeFileSync(join(project, 'unrelated.txt'), 'Synthetic unsaved edit');
    expect((await run(['v1.3.0'])).status).not.toBe(0);
    expect(readFileSync(join(project, 'unrelated.txt'), 'utf8')).toBe('Synthetic unsaved edit');
    expect(commands()).toEqual([]);
  });

  it('refuses an existing remote tag before bumping or installing', async () => {
    await git(['tag', '-a', 'v1.3.0', '-m', 'Synthetic existing tag']);
    await git(['push', '-q', 'origin', 'refs/tags/v1.3.0']);
    await git(['tag', '-d', 'v1.3.0']);
    const existingTag = await remoteRef('refs/tags/v1.3.0');
    const result = await run(['v1.3.0']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists');
    expect(await remoteRef('refs/tags/v1.3.0')).toBe(existingTag);
    expect(await git(['status', '--porcelain'])).toBe('');
    expect(commands()).toEqual([]);
  });

  it.each(['ci', '--prefix server audit', 'test', '--prefix server test', 'run test:browser', 'run build', 'run electron:build'])(
    'does not commit or push when %s fails',
    async failedCommand => {
      const result = await run(['v1.3.0'], { RELEASE_FAIL_COMMAND: failedCommand });
      expect(result.status).toBe(17);
      expect(commands()).toEqual(expectedChecks.slice(0, expectedChecks.indexOf(failedCommand) + 1));
      expect(await git(['rev-parse', 'HEAD'])).toBe(originalCommit);
      expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
      expect(await remoteRef('refs/tags/v1.3.0')).toBeNull();
      expect(await git(['tag', '--list', 'v1.3.0'])).toBe('');
      expect(readFileSync(join(project, 'package.json'), 'utf8')).toContain('1.3.0');
      expect(result.stderr).toContain('failed');
    },
  );

  it('does not stage unrelated changes introduced during validation', async () => {
    const result = await run(['v1.3.0'], { RELEASE_MUTATE_UNRELATED: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected.txt');
    expect(await git(['diff', '--cached', '--name-only'])).toBe('');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v1.3.0')).toBeNull();
  });

  it('does not publish a version file modified after its checks', async () => {
    const result = await run(['v1.3.0'], { RELEASE_MUTATE_VERSION_FILE: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Tracked files changed');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v1.3.0')).toBeNull();
    expect(await git(['diff', '--cached', '--name-only'])).toBe('');
  });

  it('does not publish changes added by a commit hook after validation', async () => {
    await commitFixtureChange('synthetic.txt', 'Synthetic validated source\n');
    const hooks = join(project, '.git/hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-commit'), `#!${fixtureShell}
set -euo pipefail
printf 'Synthetic unvalidated source\\n' >> synthetic.txt
git add -- synthetic.txt
`, { mode: 0o755 });
    const result = await run(['v1.3.0']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('commit hook');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v1.3.0')).toBeNull();
  });

  it('rechecks main after local validation and does not tag a stale branch', async () => {
    const tree = await git(['rev-parse', 'HEAD^{tree}']);
    const concurrentCommit = await git(['commit-tree', tree, '-p', originalCommit, '-m', 'Synthetic concurrent change']);
    await git(['push', '-q', 'origin', `${concurrentCommit}:refs/heads/synthetic-concurrent`]);
    const result = await run(['v1.3.0'], { RELEASE_CONCURRENT_COMMIT: concurrentCommit });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('main');
    expect(await remoteRef('refs/heads/main')).toBe(concurrentCommit);
    expect(await remoteRef('refs/tags/v1.3.0')).toBeNull();
    expect(await git(['rev-parse', 'HEAD'])).toBe(originalCommit);
  });

  it.each(['tag', 'main'])('does not publish either ref when the remote rejects %s', async rejectedRef => {
    mkdirSync(join(remote, 'hooks'), { recursive: true });
    writeFileSync(join(remote, 'hooks/update'), `#!${fixtureShell}
if [[ "$1" == ${rejectedRef === 'tag' ? 'refs/tags/*' : 'refs/heads/main'} ]]; then
  echo "Synthetic ref rejection" >&2
  exit 1
fi
`, { mode: 0o755 });
    const result = await run(['v1.3.0']);
    expect(result.status).not.toBe(0);
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v1.3.0')).toBeNull();
    expect(await git(['rev-parse', 'HEAD'])).not.toBe(originalCommit);
    expect(await git(['tag', '--list', 'v1.3.0'])).toBe('v1.3.0');
    expect(result.stderr).toContain('atomic');
  });

  it('fails if a precommitted release has inconsistent package or test versions', async () => {
    await commitFixtureChange('server/package.json', JSON.stringify({ version: '0.0.0' }) + '\n');
    const result = await run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('server/package.json');
    expect(commands()).toEqual([]);
    expect(await remoteRef('refs/tags/v1.2.3')).toBeNull();
  });

  it('does not confuse a failed remote connection with an available release tag', async () => {
    await git(['remote', 'set-url', 'origin', join(directory, 'missing-remote.git')]);
    const result = await run(['v1.3.0']);
    expect(result.status).not.toBe(0);
    expect(commands()).toEqual([]);
    expect(await git(['status', '--porcelain'])).toBe('');
    expect(await git(['tag', '--list', 'v1.3.0'])).toBe('');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
  });
});

describe('automatic version bump and release preparation', { timeout: commandTimeout + 30000 }, () => {
  it('atomically pushes an automatic patch bump and matching tag, then exposes the tag to publication', async () => {
    await publishFixtureTag('1.2.3');
    const before = originalCommit;
    await commitFixtureChange('synthetic.txt', 'Synthetic merged feature\n');
    const source = originalCommit;

    const result = await runAutomatic(before);

    expect(result.status, result.stderr).toBe(0);
    expect(releaseOutput()).toBe('tag=v1.2.4');
    expect(commands()).toEqual([]);
    const commit = await git(['rev-parse', 'HEAD']);
    expect(commit).not.toBe(source);
    expect(await git(['rev-parse', 'HEAD^'])).toBe(source);
    expect(await remoteRef('refs/heads/main')).toBe(commit);
    expect(await remoteRef('refs/tags/v1.2.4^{}')).toBe(commit);
    expect(await git(['cat-file', '-t', 'refs/tags/v1.2.4'])).toBe('tag');
    expect(await git(['log', '-1', '--format=%B'])).toBe('chore: bump version to 1.2.4 [skip ci]');
    expect((await git(['show', '--format=', '--name-only', 'HEAD'])).split('\n').sort()).toEqual([...versionFiles].sort());
    for (const file of versionFiles.filter(file => file.endsWith('.json'))) {
      const payload = JSON.parse(readFileSync(join(project, file), 'utf8'));
      expect(payload.version).toBe('1.2.4');
      if (file.endsWith('package-lock.json')) expect(payload.packages[''].version).toBe('1.2.4');
    }
    expect(readFileSync(join(project, 'tests/setup.ts'), 'utf8')).toContain("'1.2.4'");
    expect(await git(['status', '--porcelain'])).toBe('');
  });

  it('publishes the explicitly selected 2.4.1 without incrementing unpublished 2.4.3 again', async () => {
    await commitFixtureVersion('2.4.0');
    await publishFixtureTag('2.4.0');
    await commitFixtureVersion('2.4.3');
    const before = originalCommit;
    await commitFixtureVersion('2.4.1');

    const result = await runAutomatic(before);

    expect(result.status, result.stderr).toBe(0);
    expect(releaseOutput()).toBe('tag=v2.4.1');
    expect(await git(['rev-parse', 'HEAD'])).toBe(originalCommit);
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v2.4.1^{}')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v2.4.4')).toBeNull();
  });

  it('tags the exact explicit version commit without rewinding main if another PR has merged', async () => {
    const before = originalCommit;
    await commitFixtureVersion('1.3.0');
    const source = originalCommit;
    await commitFixtureChange('synthetic.txt', 'Synthetic later merged feature\n');
    const latestMain = originalCommit;

    const result = await runAutomatic(before, source);

    expect(result.status, result.stderr).toBe(0);
    expect(releaseOutput()).toBe('tag=v1.3.0');
    expect(await remoteRef('refs/tags/v1.3.0^{}')).toBe(source);
    expect(await remoteRef('refs/heads/main')).toBe(latestMain);
    expect(await git(['rev-parse', 'HEAD'])).toBe(source);
  });

  it('does not bump again when retrying a push that already has its automatic commit and tag', async () => {
    const before = originalCommit;
    await commitFixtureChange('synthetic.txt', 'Synthetic merged feature\n');
    const source = originalCommit;
    const first = await runAutomatic(before, source);
    expect(first.status, first.stderr).toBe(0);
    const commit = await git(['rev-parse', 'HEAD']);
    const tag = await remoteRef('refs/tags/v1.2.4');

    const retry = await runAutomatic(before, source);

    expect(retry.status, retry.stderr).toBe(0);
    expect(releaseOutput()).toBe('tag=v1.2.4');
    expect(await remoteRef('refs/heads/main')).toBe(commit);
    expect(await remoteRef('refs/tags/v1.2.4')).toBe(tag);
    expect(await remoteRef('refs/tags/v1.2.5')).toBeNull();
  });

  it('preserves an existing tag belonging to another commit', async () => {
    await commitFixtureVersion('1.3.0');
    await publishFixtureTag('1.3.0');
    const tag = await remoteRef('refs/tags/v1.3.0');
    await commitFixtureVersion('1.4.0');
    const before = originalCommit;
    await commitFixtureVersion('1.3.0');

    const result = await runAutomatic(before);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('will not be moved');
    expect(releaseOutput()).toBe('');
    expect(await remoteRef('refs/tags/v1.3.0')).toBe(tag);
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
  });

  it.each(['tag', 'main'])('does not publish either ref or a publication output when the remote rejects %s', async rejectedRef => {
    const before = originalCommit;
    await commitFixtureChange('synthetic.txt', 'Synthetic merged feature\n');
    mkdirSync(join(remote, 'hooks'), { recursive: true });
    writeFileSync(join(remote, 'hooks/update'), `#!${fixtureShell}
if [[ "$1" == ${rejectedRef === 'tag' ? 'refs/tags/*' : 'refs/heads/main'} ]]; then
  echo "Synthetic ref rejection" >&2
  exit 1
fi
`, { mode: 0o755 });

    const result = await runAutomatic(before);

    expect(result.status).not.toBe(0);
    expect(releaseOutput()).toBe('');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v1.2.4')).toBeNull();
    expect(await git(['tag', '--list', 'v1.2.4'])).toBe('v1.2.4');
    expect(result.stderr).toContain('atomic');
  });

  it('does not rebase a stale bump onto concurrent main changes or publish its tag', async () => {
    const before = originalCommit;
    await commitFixtureChange('synthetic.txt', 'Synthetic merged feature\n');
    const tree = await git(['rev-parse', 'HEAD^{tree}']);
    const concurrentCommit = await git(['commit-tree', tree, '-p', originalCommit, '-m', 'Synthetic concurrent main']);
    await git(['push', '-q', 'origin', `${concurrentCommit}:refs/heads/synthetic-concurrent`]);
    const hooks = join(project, '.git/hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-commit'), `#!${fixtureShell}
set -euo pipefail
git --git-dir="$RELEASE_REMOTE" update-ref refs/heads/main "$RELEASE_CONCURRENT_COMMIT"
`, { mode: 0o755 });

    const result = await runAutomatic(before, originalCommit, { RELEASE_CONCURRENT_COMMIT: concurrentCommit });

    expect(result.status).not.toBe(0);
    expect(releaseOutput()).toBe('');
    expect(await remoteRef('refs/heads/main')).toBe(concurrentCommit);
    expect(await remoteRef('refs/tags/v1.2.4')).toBeNull();
    expect(await git(['rev-parse', 'HEAD^'])).toBe(originalCommit);
  });

  it('refuses an inconsistent explicit version before publishing a tag', async () => {
    const before = originalCommit;
    await commitFixtureChange('package.json', JSON.stringify({ version: '1.3.0' }) + '\n');

    const result = await runAutomatic(before);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('package-lock.json');
    expect(releaseOutput()).toBe('');
    expect(await remoteRef('refs/tags/v1.3.0')).toBeNull();
  });

  it('rejects unmerged release sources', async () => {
    const before = originalCommit;
    writeFileSync(join(project, 'synthetic.txt'), 'Synthetic unmerged feature\n');
    await git(['add', '--', 'synthetic.txt']);
    await git(['commit', '--no-gpg-sign', '-qm', 'Synthetic unmerged commit']);
    const source = await git(['rev-parse', 'HEAD']);

    const result = await runAutomatic(before, source);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not merged');
    expect(releaseOutput()).toBe('');
    expect(await remoteRef('refs/heads/main')).toBe(originalCommit);
    expect(await remoteRef('refs/tags/v1.2.4')).toBeNull();
  });

  it('does not depend on interactive signing settings or add attribution trailers', async () => {
    const before = originalCommit;
    await commitFixtureChange('synthetic.txt', 'Synthetic merged feature\n');
    await git(['config', 'commit.gpgsign', 'true']);
    await git(['config', 'tag.gpgsign', 'true']);
    await git(['config', 'gpg.program', join(directory, 'missing-signing-program')]);

    const result = await runAutomatic(before);

    expect(result.status, result.stderr).toBe(0);
    expect(await git(['log', '-1', '--format=%B'])).toBe('chore: bump version to 1.2.4 [skip ci]');
    expect(await git(['cat-file', 'tag', 'v1.2.4'])).not.toContain('BEGIN PGP SIGNATURE');
  });
});
