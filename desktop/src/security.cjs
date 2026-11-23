'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- Shared by the CommonJS Electron entry and Node tests. */

const path = require('node:path');

const PRODUCTION_ORIGIN = 'https://www.alumexflow.com';
const LOCAL_TEST_ORIGIN = 'http://localhost:3003';
const PERSISTENT_PARTITION = 'persist:alumexflow-workspace';

function runtimeOptions(argv, packageRoot) {
  const localTest = argv.includes('--local-test');
  const smokeTest = argv.includes('--smoke-test');
  if (smokeTest && localTest) throw new Error('Use either a Windows smoke test or local testing.');
  const smokeRoot = argv.find(value => value.startsWith('--smoke-root='))?.slice('--smoke-root='.length);
  if (smokeTest && (!smokeRoot || !path.isAbsolute(smokeRoot))) throw new Error('A smoke test requires an absolute smoke-root directory.');
  const origin = localTest ? LOCAL_TEST_ORIGIN : PRODUCTION_ORIGIN;
  const customData = argv.find(value => value.startsWith('--test-data-dir='))?.slice('--test-data-dir='.length);
  if (customData && !localTest) throw new Error('A test data directory requires --local-test.');
  let testDataDirectory;
  if (localTest) {
    testDataDirectory = path.resolve(customData || path.join(packageRoot, '.runtime', 'local-test'));
    const relative = path.relative(packageRoot, testDataDirectory);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('The test data directory must be inside the desktop package.');
    }
  }
  if (smokeTest) testDataDirectory = path.join(smokeRoot, 'data');
  return { origin, localTest, smokeTest, smokeRoot, testDataDirectory, startupUrl: smokeTest ? `${origin}/login` : `${origin}/offline?path=%2Fdashboard` };
}

function isAppUrl(value, origin) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.origin === origin
      && (url.protocol === 'https:' || origin === LOCAL_TEST_ORIGIN && url.protocol === 'http:');
  } catch { return false; }
}

function isDownloadUrl(value, origin) {
  if (isAppUrl(value, origin)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'blob:' && url.origin === origin;
  } catch { return false; }
}

function webPreferences() {
  return {
    partition: PERSISTENT_PARTITION,
    contextIsolation: true, sandbox: true, nodeIntegration: false,
    nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
    webSecurity: true, allowRunningInsecureContent: false,
    webviewTag: false, navigateOnDragDrop: false,
    safeDialogs: true, spellcheck: false,
  };
}

module.exports = { PRODUCTION_ORIGIN, LOCAL_TEST_ORIGIN, PERSISTENT_PARTITION, runtimeOptions, isAppUrl, isDownloadUrl, webPreferences };
