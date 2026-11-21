// Unfold for Windows (and macOS/Linux): an Electron shell around the Expo web build.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_DIR = path.join(__dirname, 'app'); // output of `expo export --platform web`
const ORIGIN = 'app://unfold';

// A privileged custom scheme gives the app a stable origin, so IndexedDB and
// localStorage (the library, settings and reading positions) persist between runs.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function resolveAsset(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.normalize(path.join(APP_DIR, rel));
  if (!file.startsWith(APP_DIR)) return null; // no path traversal
  try {
    if (fs.statSync(file).isFile()) return file;
  } catch {
    /* fall through */
  }
  return null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 420,
    minHeight: 520,
    title: 'Unfold',
    backgroundColor: '#FAF6EC',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // Links to the outside world open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(`${ORIGIN}/`);
  return win;
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn', accelerator: 'CommandOrControl+=' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard shortcuts',
          click: (_item, win) => {
            const { dialog } = require('electron');
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'Keyboard shortcuts',
              message: 'Reading shortcuts',
              detail:
                '→  Space  Enter     Next sentence\n' +
                '←  Backspace          Previous sentence\n' +
                'A                           Reveal whole paragraph\n' +
                'L                           Listen (read aloud)\n' +
                'Esc                        Back to library\n' +
                'Ctrl + / Ctrl −         Zoom\n' +
                'F11                        Full screen',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    // Single-page app: unknown paths (e.g. /reader/123) fall back to index.html.
    const file = resolveAsset(pathname) ?? path.join(APP_DIR, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
