import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', source)(exports);
  return exports;
}

const { canAccessRoute } = load('../src/lib/auth/permissions.ts');
const { activeNavigationHrefs, isActiveSystemRoute } = load('../src/lib/systemScope.ts');

test('signed contracts is an active menu destination for indoor teams and leadership', () => {
  assert.equal(activeNavigationHrefs.includes('/signed-contracts'), true);
  assert.equal(isActiveSystemRoute('/signed-contracts'), true);
  for (const role of ['Indoor Sales', 'Sales Manager', 'Admin', 'Sales Director', 'Company Owner', 'CEO']) {
    assert.equal(canAccessRoute('/signed-contracts', role), true, role);
  }
});

test('outdoor, operational and unauthenticated users cannot open signed contract records', () => {
  for (const role of [null, 'Outdoor Sales', 'HR', 'Operations Manager', 'Project Manager', 'Finance / Accountant', 'Site Engineer']) {
    assert.equal(canAccessRoute('/signed-contracts', role), false, String(role));
  }
  assert.equal(isActiveSystemRoute('/signed-contracts/unknown'), false);
});
