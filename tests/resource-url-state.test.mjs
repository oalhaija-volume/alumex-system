import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function fixture() {
  const slots = [], requests = [], commits = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback) { cursor++; return callback; },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, offset) => value !== previous.dependencies[offset])) {
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        commits.push(() => { slots[index].cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const loader = {};
  new Function('exports', transpile('src/lib/workflow/resourceLoader.ts'))(loader);
  const fetch = (url, init) => new Promise(resolve => requests.push({ url, init, resolve: (body, status = 200) => resolve(Response.json(body, { status })) }));
  const dependencies = {
    react, 'react/jsx-runtime': {}, '@/components/i18n/I18nProvider': {},
    '@/lib/offline/client': { fieldFetch: fetch, isDeviceWorkspace: () => false },
    '@/lib/offline/device': { isOfflineDevice: () => false },
    '@/lib/workflow/resourceLoader': loader,
    '@/lib/workflow/workspaceEvents': { subscribeWorkspaceChanges: () => () => {} },
  };
  const exports = {}, listeners = new EventTarget();
  new Function('require', 'exports', 'fetch', 'window', 'document', transpile('src/components/workflow/ui.tsx'))(
    name => { assert.ok(name in dependencies, name); return dependencies[name]; }, exports, fetch, listeners, { visibilityState: 'visible' },
  );
  return {
    requests,
    render(url) { cursor = 0; return exports.useResource(url); },
    commit() { while (commits.length) commits.shift()(); },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('changing a page or project tab hides the previous response immediately until its own response settles', async () => {
  const f = fixture();
  const first = '/api/workspace?view=projects&page=1', second = '/api/workspace?view=projects&page=2';
  try {
    assert.equal(f.render(first).loading, true); f.commit();
    f.requests[0].resolve({ projects: [{ id: 'page-one' }] }); await flush();
    assert.deepEqual(f.render(first).data, { projects: [{ id: 'page-one' }] });
    const changed = f.render(second);
    assert.equal(changed.loading, true); assert.equal(changed.data, null); assert.equal(changed.error, '');
    f.commit(); assert.equal(f.requests[0].init.signal.aborted, true);
    f.requests[1].resolve({ projects: [{ id: 'page-two' }] }); await flush();
    const settled = f.render(second);
    assert.equal(settled.loading, false); assert.deepEqual(settled.data, { projects: [{ id: 'page-two' }] });
  } finally { f.dispose(); }
});

test('a failed new URL settles its loading state without displaying records from the previous URL', async () => {
  const f = fixture();
  try {
    f.render('/api/first'); f.commit(); f.requests[0].resolve({ id: 'previous-project' }); await flush();
    f.render('/api/second'); f.commit(); f.requests[1].resolve({ error: 'Unable to load this project' }, 500); await flush();
    assert.equal(f.render('/api/second').data, null);
    assert.equal(f.render('/api/second').loading, false);
    assert.equal(f.render('/api/second').error, 'Unable to load this project');
    assert.equal(f.render('/api/third').data, null);
    assert.equal(f.render('/api/third').error, '');
  } finally { f.dispose(); }
});
