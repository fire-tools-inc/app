// Electron's ASAR-aware filesystem must not traverse app.asar as a directory
// when moving or removing a physical application bundle.
const disk = process.versions.electron ? require('original-fs') : require('node:fs');
const fs = disk.promises;
const { constants, createReadStream } = disk;
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');
const { execFile, fork } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');

const run = promisify(execFile);

async function verifyArchive(archive, sha512) {
  const expected = Buffer.from(sha512 || '', 'base64');
  if (expected.length !== 64 || expected.toString('base64') !== sha512) {
    throw new Error('The macOS release is missing a valid SHA-512 checksum.');
  }
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (!timingSafeEqual(hash.digest(), expected)) {
    throw new Error('The macOS update ZIP failed SHA-512 verification.');
  }
}

async function prepareUpdate({ appPath, archive, sha512, version }) {
  await verifyArchive(archive, sha512);
  appPath = await fs.realpath(appPath);
  if (!appPath.endsWith('.app') || !(await fs.lstat(appPath)).isDirectory()) {
    throw new Error('Install Fire Tools in a writable Applications folder before updating.');
  }
  try {
    await fs.access(path.dirname(appPath), constants.W_OK);
  } catch (error) {
    throw new Error('The app folder is not writable. Move Fire Tools to a writable Applications folder.', { cause: error });
  }

  const { stdout } = await run('/usr/bin/unzip', ['-Z1', archive], { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 });
  for (const entry of stdout.trim().split('\n')) {
    const parts = entry.split('/');
    if (
      !['Fire Tools.app', '__MACOSX'].includes(parts[0]) ||
      parts.some(part => part === '..' || part === '.') ||
      entry.includes('\\')
    ) {
      throw new Error(`Unexpected path in macOS update ZIP: ${entry}`);
    }
  }

  const stageDir = await fs.mkdtemp(path.join(path.dirname(appPath), '.fire-tools-update-'));
  const stagedApp = path.join(stageDir, 'Fire Tools.app');
  try {
    // Keep staging on the target volume for atomic renames; do not propagate quarantine.
    await run('/usr/bin/ditto', ['-x', '-k', '--noqtn', archive, stageDir], { timeout: 120_000 });
    const plist = path.join(stagedApp, 'Contents', 'Info.plist');
    const readKey = async key => (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).stdout.trim();
    if (await readKey('CFBundleIdentifier') !== 'dev.mb-consulting.firetools') {
      throw new Error('The macOS update has an unexpected bundle identifier.');
    }
    if (await readKey('CFBundleShortVersionString') !== version) {
      throw new Error('The macOS update bundle version does not match the release manifest.');
    }
    if (await readKey('CFBundleExecutable') !== 'Fire Tools') {
      throw new Error('The macOS update has an unexpected executable.');
    }
    await fs.access(path.join(stagedApp, 'Contents', 'MacOS', 'Fire Tools'), constants.X_OK);
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagedApp], { timeout: 60_000 });
    return { appPath, stageDir, stagedApp, parentPid: process.pid, relaunch: true };
  } catch (error) {
    try {
      await fs.rm(stageDir, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Could not prepare or clean up macOS update: ${stageDir}`);
    }
    throw error;
  }
}

async function waitForExit(pid, timeoutMs = 120_000) {
  if (!Number.isInteger(pid) || pid <= 1) {
    throw new Error('Invalid running-app process ID.');
  }
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    if (Date.now() >= deadline) {
      throw new Error('Fire Tools did not exit; the installed app was not changed.');
    }
    await delay(250);
  }
}

async function openApp(appPath) {
  await run('/usr/bin/open', ['-n', appPath]);
}

async function installUpdate(job, hooks = {}) {
  const { appPath, stageDir, stagedApp } = job;
  if (
    !path.isAbsolute(appPath) ||
    !appPath.endsWith('.app') ||
    path.dirname(stageDir) !== path.dirname(appPath) ||
    !path.basename(stageDir).startsWith('.fire-tools-update-') ||
    stagedApp !== path.join(stageDir, 'Fire Tools.app')
  ) {
    throw new Error('Invalid macOS update staging paths.');
  }

  await (hooks.waitForExit || waitForExit)(job.parentPid);
  const previousApp = path.join(stageDir, 'previous.app');
  let movedOriginal = false;
  let installed = false;
  try {
    await fs.rename(appPath, previousApp);
    movedOriginal = true;
    await fs.rename(stagedApp, appPath);
    installed = true;
    if (job.relaunch) await (hooks.openApp || openApp)(appPath);
  } catch (error) {
    if (!movedOriginal) throw error;
    try {
      if (installed) await fs.rename(appPath, stagedApp);
      await fs.rename(previousApp, appPath);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `macOS update and rollback failed. Recovery files: ${stageDir}`,
      );
    }
    throw new Error(`macOS update failed; the previous app was restored: ${error.message}`, { cause: error });
  }
  await fs.rm(stageDir, { recursive: true, force: true });
}

async function startInstaller(job, userDataDir) {
  const helperPath = path.join(job.stageDir, 'install.cjs');
  const source = await require('node:fs/promises').readFile(__filename);
  await fs.writeFile(helperPath, source, { mode: 0o600 });
  const errorPath = path.join(userDataDir, 'mac-update-error.json');
  const log = await fs.open(path.join(userDataDir, 'mac-update-install.log'), 'w', 0o600);
  let child;
  try {
    child = fork(helperPath, [JSON.stringify({ ...job, errorPath })], {
      execPath: process.execPath,
      execArgv: [],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      detached: true,
      stdio: ['ignore', log.fd, log.fd, 'ipc'],
    });
  } finally {
    await log.close();
  }
  return new Promise((resolve, reject) => {
    const fail = error => {
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('The macOS update installer did not start.')), 10_000);
    child.once('error', fail);
    child.once('exit', code => fail(new Error(`The macOS update installer exited before startup (${code}).`)));
    child.once('message', message => {
      if (message !== 'ready') return fail(new Error('The macOS update installer sent an invalid startup message.'));
      clearTimeout(timer);
      child.removeListener('error', fail);
      child.removeAllListeners('exit');
      child.on('error', error => console.error('[fire-tools] macOS installer process failed:', error));
      if (child.connected) child.disconnect();
      child.unref();
      resolve(child);
    });
  });
}

async function readInstallError(userDataDir) {
  const errorPath = path.join(userDataDir, 'mac-update-error.json');
  let contents;
  try {
    contents = await fs.readFile(errorPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const failure = JSON.parse(contents);
  if (typeof failure.message !== 'string') throw new Error('Invalid macOS update failure record.');
  await fs.unlink(errorPath);
  return `${failure.message} See ${path.join(userDataDir, 'mac-update-install.log')}`;
}

if (require.main === module) {
  let job;
  Promise.resolve().then(async () => {
    job = JSON.parse(process.argv[2]);
    if (process.send) {
      await new Promise((resolve, reject) => process.send('ready', error => error ? reject(error) : resolve()));
    }
    await installUpdate(job);
  }).catch(async error => {
    console.error('[fire-tools] macOS update installation failed:', error);
    if (job?.errorPath) {
      try {
        await fs.writeFile(job.errorPath, JSON.stringify({ message: error.message }), { mode: 0o600 });
      } catch (writeError) {
        console.error('[fire-tools] could not persist macOS installation error:', writeError);
      }
    }
    if (job?.relaunch && job?.appPath) {
      try {
        await openApp(job.appPath);
      } catch (relaunchError) {
        console.error('[fire-tools] could not relaunch the app after update failure:', relaunchError);
      }
    }
    process.exitCode = 1;
  });
}

module.exports = { installUpdate, prepareUpdate, readInstallError, startInstaller, verifyArchive, waitForExit };
