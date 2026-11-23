'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Electron's main entry uses CommonJS. */

const { app, BrowserWindow, Menu, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { runtimeOptions, isAppUrl, isDownloadUrl, webPreferences, PERSISTENT_PARTITION } = require('./security.cjs');

app.setName('AlumexFlow Desktop');
const packageRoot = path.resolve(__dirname, '..');
const options = runtimeOptions(process.argv, packageRoot);
// Runtime data belongs to the Windows user, separately from the installed
// application. Local tests keep every writable path within this package.
const dataDirectory = options.testDataDirectory || path.join(app.getPath('appData'), 'AlumexFlow Desktop');
for (const child of ['', 'sessions', 'logs', 'crash-dumps', 'temp']) fs.mkdirSync(path.join(dataDirectory, child), { recursive: true });
app.setPath('userData', dataDirectory);
app.setPath('sessionData', path.join(dataDirectory, 'sessions'));
app.setPath('logs', path.join(dataDirectory, 'logs'));
app.setPath('crashDumps', path.join(dataDirectory, 'crash-dumps'));
if (options.localTest || options.smokeTest) app.setPath('temp', path.join(dataDirectory, 'temp'));
app.setAppUserModelId('com.alumex.flow.desktop');
app.enableSandbox();

const helpPath = path.join(__dirname, 'connection.html');
const helpUrl = pathToFileURL(helpPath).href;
let mainWindow;
let stopping = false;
let showingConnectionHelp = false;
let smokeFinished = false;
let smokeTimeout;
const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();

function finishSmoke(passed, details = {}) {
  if (!options.smokeTest || smokeFinished) return;
  smokeFinished = true; clearTimeout(smokeTimeout);
  const report = { passed, version: app.getVersion(), platform: process.platform, architecture: process.arch,
    publicLoginOnly: true, businessWrites: 0, ...details };
  fs.writeFileSync(path.join(options.smokeRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  stopping = true;
  app.exit(passed ? 0 : 1);
}

function isHelpUrl(value) {
  try { const url = new URL(value); url.hash = ''; return url.href === helpUrl; } catch { return false; }
}

async function showConnectionHelp() {
  if (!mainWindow || mainWindow.isDestroyed() || stopping || showingConnectionHelp) return;
  if (options.smokeTest) { finishSmoke(false, { connectionAvailable: false }); return; }
  showingConnectionHelp = true;
  try { await mainWindow.loadFile(helpPath, { hash: options.localTest ? 'local-test' : 'production' }); }
  catch { app.quit(); }
  finally { showingConnectionHelp = false; }
}

async function openWorkspace() {
  if (!mainWindow || mainWindow.isDestroyed() || stopping) return;
  try {
    await mainWindow.loadURL(options.startupUrl);
  } catch {
    if (!mainWindow || mainWindow.isDestroyed() || stopping) return;
    await showConnectionHelp();
  }
}

function configureSession(workspaceSession) {
  workspaceSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  workspaceSession.setPermissionCheckHandler(() => false);
  workspaceSession.on('will-download', (event, item, contents) => {
    if (contents !== mainWindow?.webContents || !isDownloadUrl(item.getURL(), options.origin)) {
      event.preventDefault();
      return;
    }
    // Keep Electron's native Save dialog. No renderer-provided filesystem path
    // is trusted or silently written by the wrapper.
    item.setSaveDialogOptions({ title: 'Save AlumexFlow document', defaultPath: path.basename(item.getFilename()) });
  });
}

function createWindow() {
  const workspaceSession = session.fromPartition(PERSISTENT_PARTITION, { cache: true });
  configureSession(workspaceSession);
  const window = new BrowserWindow({
    title: 'AlumexFlow Desktop', width: 1366, height: 900, minWidth: 360, minHeight: 600,
    backgroundColor: '#f4f6f9', show: false, autoHideMenuBar: true,
    icon: path.join(packageRoot, 'assets', 'alumex.png'),
    webPreferences: webPreferences(),
  });
  mainWindow = window;
  window.webContents.setUserAgent(`${window.webContents.getUserAgent()} AlumexFlowDesktop/${app.getVersion()}`);
  window.once('ready-to-show', () => window.show());
  if (options.smokeTest) {
    let httpStatus = 0;
    window.webContents.on('did-navigate', (_event, url, status) => { if (isAppUrl(url, options.origin)) httpStatus = status; });
    window.webContents.once('did-finish-load', () => {
      setTimeout(() => finishSmoke(httpStatus === 200 && window.isVisible() && isAppUrl(window.webContents.getURL(), options.origin), {
        browserWindowCreated: true, windowVisible: window.isVisible(), httpStatus,
        appOriginLoaded: isAppUrl(window.webContents.getURL(), options.origin),
        rendererSandboxed: window.webContents.getLastWebPreferences().sandbox === true,
      }), 3000);
    });
    smokeTimeout = setTimeout(() => finishSmoke(false, { timedOut: true }), 45000);
  }
  window.on('closed', () => { mainWindow = undefined; });
  const guardNavigation = (event, value) => {
    const url = typeof value === 'string' ? value : value?.url ?? event.url;
    if (!isAppUrl(url, options.origin) && !isHelpUrl(url)) event.preventDefault();
  };
  window.webContents.on('will-navigate', guardNavigation);
  window.webContents.on('will-redirect', guardNavigation);
  window.webContents.on('will-frame-navigate', guardNavigation);
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url, options.origin)) void window.loadURL(url).catch(() => openWorkspace());
    return { action: 'deny' };
  });
  window.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isAppUrl(url, options.origin) && !stopping) {
      void showConnectionHelp();
    }
  });
  window.webContents.on('render-process-gone', () => { if (!stopping) void openWorkspace(); });
  return openWorkspace();
}

function configureMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Workspace', submenu: [
      { label: 'Open dashboard', accelerator: 'CmdOrCtrl+Home', click: () => void openWorkspace() },
      { label: 'Reload workspace', accelerator: 'CmdOrCtrl+R', click: () => void openWorkspace() },
      { label: 'Print', accelerator: 'CmdOrCtrl+P', click: () => {
        if (mainWindow && isAppUrl(mainWindow.webContents.getURL(), options.origin)) mainWindow.webContents.print({ silent: false, printBackground: true });
      } },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
  ]));
}

app.on('before-quit', () => { stopping = true; });
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.on('window-all-closed', () => app.quit());
if (ownsLock) app.whenReady().then(() => { configureMenu(); return createWindow(); }).catch(() => app.quit());
