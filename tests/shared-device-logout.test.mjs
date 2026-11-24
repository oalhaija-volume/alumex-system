import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function logoutFixture({ configured = true, failure = false } = {}) {
  const calls = [], deleted = [];
  const dependencies = {
    'next/server': { NextResponse: { redirect(url, status) {
      const response = new Response(null, { status, headers: { location: String(url) } });
      response.cookies = { delete: name => deleted.push(name) };
      return response;
    } } },
    '@/lib/supabase/config': { hasSupabaseConfig: () => configured },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { signOut: async options => {
      calls.push(options);
      if (failure) throw new Error('Auth server unavailable');
      return { error: null };
    } } }) },
  };
  const source = ts.transpileModule(readFileSync('src/app/auth/logout/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return { calls, deleted, run: () => exports.POST({
    url: 'http://localhost:3003/auth/logout',
    cookies: { getAll: () => [{ name: 'sb-project-auth-token.0' }, { name: 'sb-project-auth-token.1' }, { name: 'alumex_locale' }] },
  }) };
}

test('shared-device logout signs out the current session and expires every auth cookie chunk', async () => {
  const fixture = logoutFixture();
  const response = await fixture.run();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'http://localhost:3003/login');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(fixture.calls, [{ scope: 'local' }]);
  assert.deepEqual(fixture.deleted, ['alumex_dev_session', 'sb-project-auth-token.0', 'sb-project-auth-token.1']);
});

test('an unavailable auth service cannot retain the previous employee cookies', async () => {
  const fixture = logoutFixture({ failure: true });
  assert.equal((await fixture.run()).status, 303);
  assert.deepEqual(fixture.deleted, ['alumex_dev_session', 'sb-project-auth-token.0', 'sb-project-auth-token.1']);
});

test('development logout redirects without attempting production authentication', async () => {
  const fixture = logoutFixture({ configured: false });
  assert.equal((await fixture.run()).status, 303);
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.deleted, ['alumex_dev_session']);
});
