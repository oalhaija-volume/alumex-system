import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  });
  return exports;
}

const scope = load('src/lib/systemScope.ts');
const { onlineWorkspaceUrl } = load('src/lib/offline/navigation.ts', { '@/lib/systemScope': scope });

test('online recovery preserves the requested live workspace, filters, and project focus', () => {
  assert.equal(onlineWorkspaceUrl('/projects?stage=quotation#project-one'), '/projects?stage=quotation&__alumex_online=1#project-one');
  assert.equal(onlineWorkspaceUrl('/dashboard'), '/dashboard?__alumex_online=1');
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  for (const path of [`/quotation/${id}`, `/initial-measurements/${id}`, `/projects/${id}/follow-ups`]) {
    assert.equal(onlineWorkspaceUrl(path), path + '?__alumex_online=1');
  }
});

test('online recovery replaces an existing reconnect flag without losing other query values', () => {
  assert.equal(onlineWorkspaceUrl('/intake?__alumex_online=0&client=two&__alumex_online=0#details'), '/intake?__alumex_online=1&client=two#details');
});

test('online recovery cannot navigate to external, retired, authentication, API or offline destinations', () => {
  for (const path of ['https://evil.example/projects', '//evil.example/projects', '/\\evil.example/projects', '/offline?path=/dashboard', '/auth/logout', '/login', '/api/offline', '/retired', '/projects/../api/offline', '/unauthorized', 'projects', '']) {
    assert.equal(onlineWorkspaceUrl(path), '/dashboard?__alumex_online=1', path);
  }
});
