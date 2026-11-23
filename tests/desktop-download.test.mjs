import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function modules(dependencies = {}) {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {}; cache.set(url.href, exports);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', code)(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      assert.ok(name.startsWith('@/') || name.startsWith('.'), `Unexpected dependency: ${name}`);
      return load(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url));
    }, exports);
    return exports;
  }
  return path => load(new URL(`../src/${path}.ts`, import.meta.url));
}

const { desktopDownloadRoles, canDownloadDesktopApp } = modules()('lib/auth/permissions');
const { appRoles } = modules()('lib/auth/roles');
const { windowsDesktopRelease: release } = modules()('lib/desktop/release');
const nextResponse = { json: (value, init) => Response.json(value, init) };
const genericError = 'Windows installer download is unavailable. Please try again.';

function fixture({ role = 'Indoor Sales', branch = 'Karkh', active = true, status = 'Active', authenticated = true,
  serviceKey = true, storageError = null, storageThrows = false, adminThrows = false, failurePart = 0,
  signedUrl = 'https://storage.example.test/Setup.exe?token=private-token' } = {}) {
  const calls = [], authCalls = [];
  const profile = { role, branch, is_active: active, status, full_name: 'Installer test employee', username: 'installer-test' };
  const profileClient = { from(table) {
    authCalls.push(table);
    return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile, error: null }) };
  } };
  const { requireRole } = modules({
    'next/headers': { headers: async () => new Headers() },
    '@/lib/supabase/server': { createClient: async () => ({ ...profileClient, auth: {
      getUser: async () => ({ data: { user: authenticated ? { id: 'employee-id', email: 'installer-test@alumex.test' } : null }, error: null }),
    } }) },
    '@/lib/supabase/admin': { createAdminClient: () => profileClient },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => serviceKey },
  })('lib/auth/adminServer');
  let storageClients = 0;
  const route = modules({
    'next/server': { NextResponse: nextResponse },
    '@/lib/auth/adminServer': { requireRole: async allowed => { assert.deepEqual(allowed, desktopDownloadRoles); return requireRole(allowed); } },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => serviceKey },
    '@/lib/supabase/admin': { createAdminClient() {
      storageClients++;
      if (adminThrows) throw new Error('SECRET service-role factory failure');
      return { storage: { from(bucket) { return { createSignedUrl: async (path, seconds, options) => {
        const index = calls.length;
        calls.push({ bucket, path, seconds, options });
        if (index === failurePart && storageThrows) throw new Error('SECRET storage SDK failure with private bucket path');
        if (index === failurePart && (storageError || !signedUrl)) return { data: signedUrl === null ? null : { signedUrl }, error: storageError };
        return { data: { signedUrl: `https://storage.example.test/Setup.exe?token=private-token&part=${index + 1}` }, error: null };
      } }; } } };
    } },
  })('app/api/desktop/download/route');
  return { get: route.GET, calls, authCalls, get storageClients() { return storageClients; } };
}

async function result(x, status) {
  const response = await x.get();
  assert.equal(response.status, status);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  return response.json();
}

test('desktop installer permission includes all Indoor Sales and sales leadership only', () => {
  assert.deepEqual(desktopDownloadRoles, ['Admin', 'CEO', 'Sales Director', 'Company Owner', 'Indoor Sales', 'Sales Manager']);
  for (const role of appRoles) assert.equal(canDownloadDesktopApp(role), desktopDownloadRoles.includes(role), role);
  for (const role of [null, undefined, '', 'Unknown']) assert.equal(canDownloadDesktopApp(role), false);
});

for (const branch of ['Karkh', 'Rasafa', 'Najaf', null]) test(`an active Indoor Sales employee can download without branch restrictions: ${branch}`, async () => {
  const x = fixture({ branch });
  const body = await result(x, 200);
  assert.deepEqual(body, { parts: release.parts.map((part, index) => ({ url: `https://storage.example.test/Setup.exe?token=private-token&part=${index + 1}`, bytes: part.bytes, sha256: part.sha256 })), filename: release.filename,
    version: release.version, bytes: release.bytes, sha256: release.sha256 });
  assert.deepEqual(x.calls, release.parts.map(part => ({ bucket: release.bucket, path: part.path, seconds: 3600, options: undefined })));
  assert.equal(body.parts.reduce((sum, part) => sum + part.bytes, 0), body.bytes);
  assert.equal(Object.hasOwn(body, 'url'), false);
  assert.equal(x.storageClients, 1);
  assert.equal(body.filename, 'Setup.exe');
  assert.equal(Object.hasOwn(body, 'bucket'), false); assert.equal(Object.hasOwn(body, 'path'), false);
});

for (const role of ['Admin', 'CEO', 'Sales Director', 'Company Owner', 'Sales Manager']) test(`${role} retains installer access`, async () => {
  const x = fixture({ role }); await result(x, 200); assert.equal(x.calls.length, 3);
});

test('unauthenticated requests return 401 before profile lookup or storage clients', async () => {
  const x = fixture({ authenticated: false });
  assert.deepEqual(await result(x, 401), { error: 'Authentication is required.' });
  assert.equal(x.authCalls.length, 0); assert.equal(x.storageClients, 0); assert.equal(x.calls.length, 0);
});

for (const role of appRoles.filter(role => !desktopDownloadRoles.includes(role))) test(`${role} cannot obtain a signed installer URL`, async () => {
  const x = fixture({ role }); const body = await result(x, 403);
  assert.equal(Object.hasOwn(body, 'url'), false); assert.equal(x.storageClients, 0); assert.equal(x.calls.length, 0);
});

for (const state of [{ active: false }, { active: null }, { status: 'Inactive' }]) test(`inactive Indoor Sales cannot obtain a signed URL: ${JSON.stringify(state)}`, async () => {
  const x = fixture(state); await result(x, 403);
  assert.equal(x.storageClients, 0); assert.equal(x.calls.length, 0);
});

test('missing server storage credentials return a generic 503 without creating a storage client', async () => {
  const x = fixture({ serviceKey: false });
  assert.deepEqual(await result(x, 503), { error: genericError });
  assert.equal(x.storageClients, 0); assert.equal(x.calls.length, 0);
});

for (const failure of [{ storageError: { message: 'SECRET backend error', statusCode: '403' } }, { storageThrows: true },
  { adminThrows: true }, { signedUrl: null }, { signedUrl: '' },
  { storageError: { message: 'SECRET final part failure' }, failurePart: 2 }, { storageThrows: true, failurePart: 1 }]) test(`storage failure returns a sanitized, noncached 503: ${JSON.stringify(failure)}`, async () => {
  const x = fixture(failure); const body = await result(x, 503);
  assert.deepEqual(body, { error: genericError }); assert.doesNotMatch(JSON.stringify(body), /SECRET|token|bucket|path/);
  assert.equal(Object.hasOwn(body, 'parts'), false, 'Successful partial signing must never disclose URLs when another part failed');
});
