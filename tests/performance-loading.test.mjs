import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {if(name==='@/lib/workflow/reactivation')return load('../src/lib/workflow/reactivation.ts');if(name==='@/lib/offline/device')return load('../src/lib/offline/device.ts');if(name==='@/lib/measurements/completion')return load('../src/lib/measurements/completion.ts');if(name==='@/lib/measurements/measurementDelay')return load('../src/lib/measurements/measurementDelay.ts',{'@/lib/auth/permissions':load('../src/lib/auth/permissions.ts')});
    if(name==='@/lib/intake/buildingType')return load('../src/lib/intake/buildingType.ts',{});
    if(name==='@/lib/intake/readinessNote')return load('../src/lib/intake/readinessNote.ts',{});
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
const actor = { id: 'employee', role: 'Outdoor Sales' };
const project = { id: 'project', client_id: 'client', created_by: actor.id, assigned_outdoor_sales_id: actor.id, follow_up_owner_id: actor.id };
const json = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
const dependencies = {
  'next/server': json,
  '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, user: { id: actor.id }, role: actor.role }) },
  '@/lib/workflow/access': { salesRoles: ['Outdoor Sales'] },
  '@/lib/workflow/followUps': {}, '@/lib/auth/permissions': {},
  '@/lib/measurements/registrationOpening': {}, '@/lib/location/coordinates': {},
};
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const endpoint of ['workspace', 'offline']) {
  test(`${endpoint} overlaps independent reads and preserves the employee's project scope`, async () => {
    const started = new Map();
    const filters = [];
    const admin = { from(table) {
      let fields;
      return {
        select(value) { fields = value; return this; },
        eq() { return this; }, in() { return this; }, order() { return this; }, single() { return this; },
        or(value) { filters.push(value); return this; },
        then(resolve) {
          const key = table === 'profiles' ? fields.startsWith('full_name') ? 'actor' : fields.endsWith(',role') ? 'directory' : 'people' : table;
          return new Promise(done => started.set(key, data => done({ data, error: null }))).then(resolve);
        },
      };
    } };
    const route = load(`../src/app/api/${endpoint}/route.ts`, { ...dependencies, '@/lib/supabase/admin': { createAdminClient: () => admin } });
    const response = route.GET(new Request(`http://localhost:3003/api/${endpoint}`));
    await tick();
    assert.deepEqual([...started.keys()].sort(), (endpoint === 'offline' ? ['actor', 'directory', 'projects'] : ['directory', 'projects']).sort());
    assert.deepEqual(filters, ['created_by.eq.employee,assigned_outdoor_sales_id.eq.employee']);
    started.get('projects')([project]);
    started.get('directory')([{ id: actor.id, full_name: 'Employee', role: actor.role }]);
    started.get('actor')?.({ full_name: 'Employee', branch: 'Karkh' });
    await tick();
    // Contacts, employee names, and measurements must all start before any finishes.
    assert.ok(started.has('clients'));
    assert.ok(started.has('people'));
    if (endpoint === 'offline') {assert.ok(started.has('openings'));assert.ok(started.has('measurement_completion_reports'));}
    started.get('people')([{ id: actor.id, full_name: 'Employee' }]);
    started.get('clients')([{ id: 'client', mobile: '07700000000' }]);
    started.get('openings')?.([]);
    started.get('measurement_completion_reports')?.([]);
    const result = await response;
    assert.equal(result.status, 200);
    assert.equal(result.body.actor.id, actor.id);
    assert.equal(result.body.projects[0].registeredBy, 'Employee');
    assert.equal(result.body.projects[0].phone, '07700000000');
    assert.equal(result.body.projects[0].assignedToYou, true);
  });

  test(`${endpoint} does not start data reads before authorization`, async () => {
    const route = load(`../src/app/api/${endpoint}/route.ts`, {
      ...dependencies,
      '@/lib/auth/adminServer': { requireRole: async () => ({ ok: false, error: 'Unauthorized', status: 401 }) },
      '@/lib/supabase/admin': { createAdminClient: () => assert.fail('Unauthorized data read') },
    });
    assert.equal((await route.GET(new Request(`http://localhost:3003/api/${endpoint}`))).status, 401);
  });
}

test('the synchronization identity check does not download projects or directories', async () => {
  const tables = [];
  const route = load('../src/app/api/offline/route.ts', {
    ...dependencies,
    '@/lib/supabase/admin': { createAdminClient: () => ({ from(table) {
      tables.push(table);
      return { select() { return this; }, eq() { return this; }, single: async () => ({ data: { full_name: 'Employee', branch: 'Karkh' } }) };
    } }) },
  });
  const response = await route.GET(new Request('http://localhost:3003/api/offline?session=1'));
  assert.equal(response.status, 200);
  assert.equal(response.body.actor.branch, null, 'Outdoor Sales never inherit a cached single-branch assignment');
  assert.deepEqual(tables, ['profiles']);
});

for (const [role, active, destination] of [['Indoor Sales', true, null], ['HR', true, '/unauthorized'], ['Indoor Sales', false, '/unauthorized']]) {
  test(`navigation retains access checks for ${role}, active=${active}, without unused access reads`, async () => {
    const tables = [];
    const proxy = load('../src/proxy.ts', {
      'next/server': { NextResponse: { next: () => 'allowed', redirect: url => url.pathname } },
      '@/lib/systemScope': { isActiveSystemRoute: () => true },
      '@/lib/auth/mobileAccess': { usesMobileWorkspace: () => false },
      '@/lib/auth/permissions': load('../src/lib/auth/permissions.ts'),
      '@/lib/auth/roles': load('../src/lib/auth/roles.ts'),
      '@/lib/supabase/config': { hasSupabaseConfig: () => true },
      '@/lib/supabase/proxy': { createProxyClient: () => ({ response: 'allowed', supabase: {
        auth: { getUser: async () => ({ data: { user: { id: actor.id } }, error: null }) },
        from(table) { tables.push(table); return {
          select() { return this; }, eq() { return this; }, single: async () => ({ data: { role, is_active: active, status: active ? 'Active' : 'Inactive' } }),
        }; },
      } }) },
    });
    const result = await proxy.proxy({ nextUrl: new URL('http://localhost:3003/quotation/11111111-1111-4111-8111-111111111111'), url: 'http://localhost:3003/quotation/11111111-1111-4111-8111-111111111111', headers: new Headers() });
    assert.equal(result, destination ?? 'allowed');
    assert.deepEqual(tables, ['profiles']);
  });
}
