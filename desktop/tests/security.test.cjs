'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- This test exercises the CommonJS desktop package. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runtimeOptions, isAppUrl, isDownloadUrl, webPreferences, PERSISTENT_PARTITION, PRODUCTION_ORIGIN } = require('../src/security.cjs');
const packageRoot = path.resolve(__dirname, '..');

test('production origin cannot be replaced by arbitrary command-line input', () => {
  const options = runtimeOptions(['--origin=https://evil.example', '--url=file:///secret'], packageRoot);
  assert.equal(options.origin, PRODUCTION_ORIGIN);
  assert.equal(options.startupUrl, 'https://www.alumexflow.com/offline?path=%2Fdashboard');
  assert.equal(options.testDataDirectory, undefined);
});
test('local testing requires explicit flag and keeps data inside desktop package', () => {
  const options = runtimeOptions(['--local-test'], packageRoot);
  assert.equal(options.origin, 'http://localhost:3003');
  assert.ok(options.testDataDirectory.startsWith(packageRoot + path.sep));
  assert.throws(() => runtimeOptions(['--test-data-dir=escape'], packageRoot));
  assert.throws(() => runtimeOptions(['--local-test', '--test-data-dir=../escape'], packageRoot));
});
test('navigation rejects protocol confusion, credentials, lookalike hosts and external origins', () => {
  assert.equal(isAppUrl('https://www.alumexflow.com/quotation/123', PRODUCTION_ORIGIN), true);
  for (const value of ['https://www.alumexflow.com.evil.example/', 'https://evil.example/?host=www.alumexflow.com', 'https://user:pass@www.alumexflow.com/', 'http://www.alumexflow.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hello', 'not a url']) {
    assert.equal(isAppUrl(value, PRODUCTION_ORIGIN), false, value);
  }
});
test('downloads allow same-origin documents and their blobs only', () => {
  assert.equal(isDownloadUrl('https://www.alumexflow.com/api/document', PRODUCTION_ORIGIN), true);
  assert.equal(isDownloadUrl('blob:https://www.alumexflow.com/uuid', PRODUCTION_ORIGIN), true);
  assert.equal(isDownloadUrl('blob:https://evil.example/uuid', PRODUCTION_ORIGIN), false);
  assert.equal(isDownloadUrl('file:///secret', PRODUCTION_ORIGIN), false);
});
test('persistent session keeps renderer sandboxed and removes privileged integration', () => {
  const prefs = webPreferences();
  assert.equal(prefs.partition, PERSISTENT_PARTITION); assert.ok(prefs.partition.startsWith('persist:'));
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.webSecurity, true);
  for (const key of ['nodeIntegration', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames', 'webviewTag', 'allowRunningInsecureContent', 'navigateOnDragDrop']) assert.equal(prefs[key], false);
  assert.equal(prefs.preload, undefined);
});
test('Windows smoke mode uses the public login and explicit local report/data directory', () => {
  assert.throws(() => runtimeOptions(['--smoke-test'], packageRoot));
  assert.throws(() => runtimeOptions(['--smoke-test', '--local-test'], packageRoot));
  const smokeRoot = path.join(packageRoot, '.runtime', 'windows-smoke');
  const options = runtimeOptions(['--smoke-test', '--smoke-root=' + smokeRoot], packageRoot);
  assert.equal(options.startupUrl, PRODUCTION_ORIGIN + '/login');
  assert.equal(options.testDataDirectory, path.join(smokeRoot, 'data'));
});
