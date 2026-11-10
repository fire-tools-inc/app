const { AppUpdater } = require('electron-updater');
const fs = (process.versions.electron ? require('original-fs') : require('node:fs')).promises;
const path = require('node:path');
const { prepareUpdate, startInstaller } = require('./mac-install.cjs');

// Keep electron-updater's public GitHub provider, cache and verified downloads,
// but do not hand ad-hoc-signed bundles to Squirrel.Mac.
class MacUpdater extends AppUpdater {
  constructor(app) {
    super({ provider: 'github', owner: 'fire-tools-inc', repo: 'app', private: false }, app);
    this.autoInstallOnAppQuit = false;
    this.downloaded = null;
    this.installing = false;
  }

  async doDownloadUpdate(downloadUpdateOptions) {
    this.downloaded = null;
    const { info, provider } = downloadUpdateOptions.updateInfoAndProvider;
    const filename = `Fire.Tools-${info.version}-${process.arch}-mac.zip`;
    const fileInfo = provider.resolveFiles(info).find(file => path.basename(file.url.pathname) === filename);
    if (!fileInfo) {
      throw new Error(`The release does not contain a macOS update for ${process.arch}: ${filename}`);
    }
    if (
      fileInfo.url.origin !== 'https://github.com' ||
      !fileInfo.url.pathname.startsWith('/fire-tools-inc/app/releases/download/') ||
      fileInfo.url.username || fileInfo.url.password
    ) {
      throw new Error('The macOS update must come from the public fire-tools-inc/app GitHub release.');
    }
    const sha512 = fileInfo.info.sha512;
    if (typeof sha512 !== 'string' || Buffer.from(sha512, 'base64').length !== 64) {
      throw new Error('The macOS release is missing a valid SHA-512 checksum.');
    }
    return this.executeDownload({
      fileExtension: 'zip',
      fileInfo,
      downloadUpdateOptions,
      task: (destination, options) => this.httpExecutor.download(fileInfo.url, destination, options),
      done: async event => {
        this.downloaded = { archive: event.downloadedFile, sha512, version: event.version };
        this.dispatchUpdateDownloaded(event);
      },
    });
  }

  async quitAndInstall() {
    if (!this.app.isPackaged) throw new Error('Unpackaged development apps cannot install updates.');
    if (!this.downloaded) throw new Error('Download a macOS update before installing it.');
    if (this.installing) {
      this._logger.warn('A macOS update installation is already in progress.');
      return false;
    }
    this.installing = true;
    let prepared;
    let started = false;
    try {
      prepared = await prepareUpdate({
        ...this.downloaded,
        appPath: path.resolve(process.execPath, '../../..'),
      });
      prepared.relaunch = this.autoRunAppAfterInstall;
      await startInstaller(prepared, this.app.userDataPath);
      started = true;
      this.app.quit();
      return true;
    } catch (error) {
      this.installing = false;
      if (prepared && !started) {
        try {
          await fs.rm(prepared.stageDir, { recursive: true, force: true });
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], `Could not start or clean up macOS update: ${prepared.stageDir}`);
        }
      }
      throw error;
    }
  }
}

module.exports = { MacUpdater };
