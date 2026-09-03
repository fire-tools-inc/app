// electron-builder afterSign hook (macOS).
//
// Problem: When building without a paid Apple Developer cert,
// electron-builder performs ad-hoc signing. The default ad-hoc signature
// stamps the binary with `Identifier=Electron`. macOS uses that codesign
// identifier — NOT CFBundleIdentifier from Info.plist — to associate
// notifications with an app. So `new Notification(...).show()` from the
// main process silently goes nowhere (or under a phantom "Electron" entry)
// instead of "Fire Tools" in NotificationCenter.
//
// Fix: After electron-builder finishes its signing pass, re-run
//   codesign --force --deep --sign - --identifier <bundleId>
// on the .app bundle so the signature carries the right identifier. This
// is a no-op on non-macOS platforms or when a real signing identity was
// already used (CSC_LINK / CSC_NAME set), which already supplies a proper
// identifier. Ad-hoc output is for local development only: its designated
// requirement is build-specific, so Squirrel.Mac cannot use it for updates.

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }
  if (process.env.CSC_LINK || process.env.CSC_NAME) {
    // Real Developer ID signing — leave the signature alone.
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    console.warn(`[afterSign] expected .app not found at ${appPath}, skipping`);
    return;
  }

  const bundleId = packager.appInfo.macBundleIdentifier;
  if (!bundleId) {
    console.warn('[afterSign] no macBundleIdentifier resolved, skipping');
    return;
  }

  const entitlements =
    packager.config?.mac?.entitlements ||
    'electron/build/entitlements.mac.plist';

  console.log(
    `[afterSign] re-signing ${appPath} with identifier ${bundleId}`
  );
  try {
    execFileSync(
      'codesign',
      [
        '--force',
        '--deep',
        '--sign',
        '-',
        '--identifier',
        bundleId,
        '--options',
        'runtime',
        '--entitlements',
        entitlements,
        appPath,
      ],
      { stdio: 'inherit' }
    );
  } catch (err) {
    console.error('[afterSign] codesign re-sign failed:', err);
    throw err;
  }
};
