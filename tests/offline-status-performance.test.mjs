import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

test('desktop status does not download an offline workspace while retained saves can still sync', async () => {
  const effects = [];
  const calls = { snapshots: 0, reads: 0, syncs: 0, workerUpdates: 0 };
  const dependencies = {
    'react/jsx-runtime': jsx,
    react: {
      useEffect: effect => effects.push(effect),
      useState: value => [value, () => {}],
      useSyncExternalStore: () => false,
    },
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term: value => value }) },
    '@/lib/offline/device': { isOfflineDevice: () => false },
    '@/lib/offline/client': {
      prepareOffline: async () => { calls.snapshots++; },
      syncFieldChanges: async () => { calls.syncs++; },
      isFieldOnline: () => true,
    },
    '@/lib/offline/store': {
      activeFieldUser: () => 'retained-employee',
      readFieldState: async () => { calls.reads++; return null; },
    },
  };
  const source = ts.transpileModule(readFileSync(new URL('../src/components/offline/OfflineStatus.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', 'navigator', 'window', 'setInterval', source)(
    name => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    exports,
    { serviceWorker: { getRegistration: async () => ({ update: async () => { calls.workerUpdates++; } }) } },
    { addEventListener: () => assert.fail('Desktop must not start offline polling') },
    () => assert.fail('Desktop must not start an offline timer'),
  );
  assert.equal(exports.OfflineStatus({}), null);
  for (const effect of effects) effect();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, { snapshots: 0, reads: 0, syncs: 1, workerUpdates: 1 });
});
