import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

test('a project card enables history only near the viewport and can resume after scrolling back', () => {
  let visible = false, observeCallback, disconnected = false;
  const effects = [], enabled = [], element = {};
  const dependencies = {
    react: {
      useEffect: callback => effects.push(callback), useId: () => 'follow-up-heading',
      useRef: () => ({ current: element }), useState: () => [visible, value => { visible = value; }],
    },
    'react-dom': {},
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/components/i18n/I18nProvider': { useI18n: () => ({ term: value => value }) },
    '@/lib/workflow/followUps': {},
    './ui': {},
    './useFollowUpHistory': { useFollowUpHistory: (_id, active) => { enabled.push(active); return { data: null, loading: false }; } },
  };
  class Observer {
    constructor(callback, options) { observeCallback = callback; assert.equal(options.rootMargin, '200px'); }
    observe(target) { assert.equal(target, element); }
    disconnect() { disconnected = true; }
  }
  const source = ts.transpileModule(readFileSync('src/components/workflow/ProjectFollowUps.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', 'IntersectionObserver', source)(name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, exports, Observer);
  const render = () => exports.ProjectFollowUps({ projectId: 'fixture-project' });
  render();
  const cleanup = effects[0]();
  observeCallback([{ isIntersecting: true }]); render();
  assert.equal(disconnected, false, 'Keep observing to detect that the card leaves the viewport');
  observeCallback([{ isIntersecting: false }]); render();
  observeCallback([{ isIntersecting: true }]); render();
  assert.deepEqual(enabled, [false, true, false, true]);
  cleanup(); assert.equal(disconnected, true);
});
