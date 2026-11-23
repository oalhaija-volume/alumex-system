import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

test('a laptop prepares durable field and quotation data and syncs both when the connection returns', async () => {
  const effects = [], listeners = new Map(), timers = new Set();
  const calls = { fieldDownloads: 0, quoteDownloads: 0, fieldSyncs: 0, quoteSyncs: 0, persist: 0, shells: 0 };
  const state = { actor: { id: 'employee', role: 'Indoor Sales', branch: 'Karkh' }, queue: [], syncedAt: null };
  const navigator = { onLine: true, storage: { persist: async () => { calls.persist++; return true; } },
    serviceWorker: { register: async path => { assert.equal(path, '/sw.js'); calls.shells++; return { active: { postMessage() {} } }; }, ready: Promise.resolve({ active: { postMessage() {} } }) } };
  const dependencies = {
    'react/jsx-runtime': jsx,
    react: { useEffect: effect => effects.push(effect), useState: value => [value, () => {}], useSyncExternalStore: () => true },
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term: value => value, errorMessage: value => value, formatNumber: String, formatDateTime: String }) },
    '@/lib/auth/permissions': { canPrepareQuotation: role => role === 'Indoor Sales' },
    '@/lib/offline/device': { isOfflineDevice: () => true },
    '@/lib/offline/client': {
      prepareOffline: async () => { calls.fieldDownloads++; return state; },
      syncFieldChanges: async () => { calls.fieldSyncs++; }, isFieldOnline: () => navigator.onLine,
    },
    '@/lib/offline/store': { activeFieldUser: () => 'employee', readFieldState: async () => state },
    '@/lib/offline/quotations': {
      prepareOfflineQuotations: async () => { calls.quoteDownloads++; },
      syncOfflineQuotations: async () => { calls.quoteSyncs++; },
      quotationSyncStatus: () => ({ pending: 1, error: null }),
    },
    './QuotationSyncConflicts': { QuotationSyncConflicts: () => null },
  };
  const source = ts.transpileModule(readFileSync(new URL('../src/components/offline/OfflineStatus.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const window = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name), setInterval: handler => { timers.add(handler); return handler; } };
  const document = { visibilityState: 'visible', addEventListener: window.addEventListener, removeEventListener: window.removeEventListener };
  new Function('require', 'exports', 'navigator', 'window', 'document', 'clearInterval', source)(
    name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; }, exports, navigator, window, document, timer => timers.delete(timer));
  exports.OfflineStatus({});
  const cleanups = effects.map(effect => effect());
  const settled = async () => { for (let index = 0; index < 5; index++) await new Promise(resolve => setImmediate(resolve)); };
  await settled();
  assert.equal(calls.shells, 1); assert.equal(calls.persist, 1);
  assert.equal(calls.fieldDownloads, 1); assert.equal(calls.quoteDownloads, 1);
  assert.equal(calls.fieldSyncs, 1); assert.equal(calls.quoteSyncs, 1);
  navigator.onLine = false; listeners.get('offline')(); await settled();
  navigator.onLine = true; listeners.get('online')(); await settled();
  assert.equal(calls.fieldDownloads, 2); assert.equal(calls.quoteDownloads, 2);
  assert.equal(calls.fieldSyncs, 2); assert.equal(calls.quoteSyncs, 2);
  for (const cleanup of cleanups) cleanup?.();
  assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
});
