// Native application menu — platform aware. Menu items either invoke
// built-in Electron roles (Edit/Window) or send IPC events to the
// renderer (Navigate/File) so React Router can handle navigation
// and components can react to import/export commands.

const { app, Menu, shell, BrowserWindow, dialog } = require('electron');

const REPO_URL = 'https://github.com/mbianchidev/fire-tools';
const DOCS_URL = 'https://mbianchidev.github.io/fire-tools/';
const ISSUES_URL = `${REPO_URL}/issues/new/choose`;
const RELEASES_URL = `${REPO_URL}/releases`;

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function sendToRenderer(channel, ...args) {
  const win = focusedWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

function navigateTo(path) {
  sendToRenderer('fire-tools:navigate', path);
}

function makeNavItem(label, path, accelerator) {
  return {
    label,
    accelerator,
    click: () => navigateTo(path),
  };
}

function buildAppMenu({ openSettings } = {}) {
  const isMac = process.platform === 'darwin';

  const appSubmenu = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      {
        label: 'Preferences…',
        accelerator: 'CmdOrCtrl+,',
        click: () => (openSettings ? openSettings() : navigateTo('/settings')),
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };

  const fileSubmenu = {
    label: 'File',
    submenu: [
      {
        label: 'Import CSV…',
        accelerator: 'CmdOrCtrl+O',
        click: () => sendToRenderer('fire-tools:menu-action', 'import-csv'),
      },
      {
        label: 'Export CSV…',
        accelerator: 'CmdOrCtrl+S',
        click: () => sendToRenderer('fire-tools:menu-action', 'export-csv'),
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  };

  const editSubmenu = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? [
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
          ]
        : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
    ],
  };

  const navigateSubmenu = {
    label: 'Navigate',
    submenu: [
      makeNavItem('FIRE Calculator', '/fire-calculator', 'CmdOrCtrl+1'),
      makeNavItem('Monte Carlo', '/monte-carlo', 'CmdOrCtrl+2'),
      makeNavItem('Asset Allocation', '/asset-allocation', 'CmdOrCtrl+3'),
      makeNavItem('Expense Tracker', '/expense-tracker', 'CmdOrCtrl+4'),
      makeNavItem('Net Worth Tracker', '/net-worth-tracker', 'CmdOrCtrl+5'),
      makeNavItem('Questionnaire', '/questionnaire', 'CmdOrCtrl+6'),
      { type: 'separator' },
      makeNavItem('Home', '/', 'CmdOrCtrl+0'),
      ...(isMac
        ? []
        : [
            { type: 'separator' },
            {
              label: 'Settings',
              accelerator: 'CmdOrCtrl+,',
              click: () => navigateTo('/settings'),
            },
          ]),
    ],
  };

  const viewSubmenu = {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };

  const windowSubmenu = {
    role: 'window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac
        ? [
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' },
          ]
        : [{ role: 'close' }]),
    ],
  };

  const helpSubmenu = {
    role: 'help',
    submenu: [
      {
        label: 'Documentation',
        click: () => shell.openExternal(DOCS_URL),
      },
      {
        label: 'GitHub Repository',
        click: () => shell.openExternal(REPO_URL),
      },
      {
        label: 'Report an Issue',
        click: () => shell.openExternal(ISSUES_URL),
      },
      {
        label: 'Releases',
        click: () => shell.openExternal(RELEASES_URL),
      },
      ...(isMac
        ? []
        : [
            { type: 'separator' },
            {
              label: 'About Fire Tools',
              click: () => showAboutDialog(),
            },
          ]),
    ],
  };

  const template = [
    ...(isMac ? [appSubmenu] : []),
    fileSubmenu,
    editSubmenu,
    navigateSubmenu,
    viewSubmenu,
    windowSubmenu,
    helpSubmenu,
  ];

  return Menu.buildFromTemplate(template);
}

function showAboutDialog() {
  const win = focusedWindow();
  const detail = [
    `Version ${app.getVersion()}`,
    `Electron ${process.versions.electron}`,
    `Node ${process.versions.node}`,
    `Chromium ${process.versions.chrome}`,
    '',
    'Privacy-first FIRE planning, all on your device.',
  ].join('\n');
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'About Fire Tools',
    message: 'Fire Tools',
    detail,
    buttons: ['OK', 'Open Website'],
    defaultId: 0,
    cancelId: 0,
  }).then((result) => {
    if (result.response === 1) shell.openExternal(DOCS_URL);
  }).catch(() => {});
}

function installMenu(opts) {
  const menu = buildAppMenu(opts);
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = {
  installMenu,
  buildAppMenu,
  showAboutDialog,
  REPO_URL,
  DOCS_URL,
  ISSUES_URL,
};
