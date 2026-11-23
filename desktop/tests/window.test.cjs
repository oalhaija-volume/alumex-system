'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- The VM harness exercises Electron's CommonJS entry. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function boot() {
  const packageRoot = path.resolve(__dirname, '..');
  const app = new EventEmitter();
  const paths = new Map();
  app.setName = () => {}; app.getPath = () => path.join(packageRoot, '.runtime', 'mock');
  app.setPath = (name, value) => paths.set(name, value);
  app.setAppUserModelId = () => {}; app.enableSandbox = () => {};
  app.requestSingleInstanceLock = () => true; app.getVersion = () => '1.0.0';
  app.quit = () => {};
  const workspaceSession = new EventEmitter();
  workspaceSession.setPermissionRequestHandler = handler => { workspaceSession.requestPermission = handler; };
  workspaceSession.setPermissionCheckHandler = handler => { workspaceSession.checkPermission = handler; };
  const windows = [];
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super(); windows.push(this); this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.getUserAgent = () => 'Chromium'; this.webContents.setUserAgent = () => {};
      this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler; };
      this.isDestroyed = () => false; this.show = () => {};
      this.loadURL = async url => { this.loadedUrl = url; };
      this.loadFile = async file => { this.loadedFile = file; };
    }
  }
  let ready;
  app.whenReady = () => ({ then: callback => { ready = Promise.resolve().then(callback); return ready; } });
  const electron = { app, BrowserWindow, Menu: { buildFromTemplate: value => value, setApplicationMenu() {} }, session: { fromPartition: () => workspaceSession } };
  const source = readFileSync(path.join(packageRoot, 'src', 'main.cjs'), 'utf8');
  const realRequire = require;
  vm.runInNewContext(source, {
    __dirname: path.join(packageRoot, 'src'),
    process: { argv: ['electron', '--local-test'] },
    require: name => name === 'electron' ? electron : name === 'node:fs' ? { mkdirSync() {} } : name === './security.cjs' ? realRequire('../src/security.cjs') : realRequire(name),
  });
  await ready;
  return { window: windows[0], workspaceSession, paths, packageRoot };
}

test('actual window handlers support current Electron event objects and block external navigation', async () => {
  const { window } = await boot();
  assert.equal(window.loadedUrl, 'http://localhost:3003/offline?path=%2Fdashboard');
  for (const eventName of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
    let prevented = false;
    window.webContents.emit(eventName, { url: 'http://localhost:3003/dashboard', preventDefault() { prevented = true; } });
    assert.equal(prevented, false, eventName);
    window.webContents.emit(eventName, { url: 'https://evil.example/', preventDefault() { prevented = true; } });
    assert.equal(prevented, true, eventName);
  }
  assert.equal(window.openHandler({ url: 'https://evil.example/' }).action, 'deny');
  assert.equal(window.loadedUrl, 'http://localhost:3003/offline?path=%2Fdashboard');
});

test('session denies unexpected device access and rejects external downloads', async () => {
  const { window, workspaceSession } = await boot();
  let allowed;
  workspaceSession.requestPermission(window.webContents, 'geolocation', value => { allowed = value; });
  assert.equal(allowed, false); assert.equal(workspaceSession.checkPermission(), false);
  let prevented = false;
  workspaceSession.emit('will-download', { preventDefault() { prevented = true; } }, { getURL: () => 'https://evil.example/app.exe' }, window.webContents);
  assert.equal(prevented, true);
  let saveDialog;
  workspaceSession.emit('will-download', { preventDefault() { throw new Error('Trusted download was blocked'); } }, {
    getURL: () => 'blob:http://localhost:3003/document', getFilename: () => '../quotation.pdf', setSaveDialogOptions: options => { saveDialog = options; },
  }, window.webContents);
  assert.equal(saveDialog.defaultPath, 'quotation.pdf');
});

test('local test lifecycle keeps every configured writable Electron path in the desktop package', async () => {
  const { paths, packageRoot } = await boot();
  for (const name of ['userData', 'sessionData', 'logs', 'crashDumps', 'temp']) {
    assert.ok(paths.get(name).startsWith(packageRoot + path.sep), name);
  }
});
