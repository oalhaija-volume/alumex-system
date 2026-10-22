import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}, DateClass = Date) {
  const url = new URL(path, import.meta.url);
  const source = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', 'Date', source)(name => {
    if (name in dependencies) return dependencies[name];
    return load(name.startsWith('@/') ? `../src/${name.slice(2)}.ts` : new URL(`${name}.ts`, url), dependencies, DateClass);
  }, exports, DateClass);
  return exports;
}

const { appRoles } = load('../src/lib/auth/roles.ts');
const leaderRoles = ['Admin', 'CEO', 'Sales Director', 'Company Owner'];
const helperPath = '../src/lib/dashboard/outdoorSalesCoverage.ts';
const routePath = '../src/app/api/outdoor-sales-coverage/route.ts';
const { outdoorSalesCoverage } = load(helperPath);
const profiles = [
  { id: 'west-starter', full_name: '  Another employee  ', username: 'west', outdoor_rotation_start_branch: 'Karkh' },
  { id: 'east-starter', full_name: 'موظف آخر', username: 'east', outdoor_rotation_start_branch: 'Rasafa' },
];

for (const [instant, expected] of [
  ['2026-10-01T00:00:00+03:00', ['Karkh', 'Rasafa']],
  ['2026-10-15T20:59:59.999Z', ['Karkh', 'Rasafa']],
  ['2026-10-15T21:00:00.000Z', ['Rasafa', 'Karkh']],
  ['2026-10-31T20:59:59.999Z', ['Rasafa', 'Karkh']],
  ['2026-10-31T21:00:00.000Z', ['Karkh', 'Rasafa']],
  ['2028-02-29T23:59:59.999+03:00', ['Rasafa', 'Karkh']],
  ['2028-03-01T00:00:00+03:00', ['Karkh', 'Rasafa']],
]) {
  test(`coverage uses Baghdad branch assignments at ${instant}`, () => {
    const date = new Date(instant);
    const before = structuredClone(profiles);
    assert.deepEqual(outdoorSalesCoverage(profiles, date), {
      asOf: date.toISOString(),
      staff: [
        { id: 'west-starter', name: 'Another employee', branch: expected[0] },
        { id: 'east-starter', name: 'موظف آخر', branch: expected[1] },
      ],
    });
    assert.deepEqual(profiles, before, 'Coverage must not modify employee profiles');
  });
}

test('coverage derives arbitrary employee names and assignments from profile data', () => {
  const date = new Date('2026-10-10T12:00:00+03:00');
  const rows = [
    { id: 'new-1', full_name: '  New team member  ', username: 'unused', outdoor_rotation_start_branch: 'Rasafa' },
    { id: 'new-2', full_name: null, username: '  field.employee  ', outdoor_rotation_start_branch: 'Karkh' },
    { id: 'new-3', full_name: ' \t ', username: '  another.employee  ', outdoor_rotation_start_branch: null },
    { id: 'new-4', full_name: null, username: '  ', outdoor_rotation_start_branch: null },
    { id: 'new-5', full_name: null, username: null, outdoor_rotation_start_branch: null },
  ];
  assert.deepEqual(outdoorSalesCoverage(rows, date), {
    asOf: date.toISOString(),
    staff: [
      { id: 'new-1', name: 'New team member', branch: 'Rasafa' },
      { id: 'new-2', name: 'field.employee', branch: 'Karkh' },
      { id: 'new-3', name: 'another.employee', branch: null },
      { id: 'new-4', name: 'Employee', branch: null },
      { id: 'new-5', name: 'Employee', branch: null },
    ],
  });
});

test('coverage marks missing or invalid rotation assignments as unconfigured', () => {
  const date = new Date('2026-10-20T12:00:00+03:00');
  for (const seed of [undefined, null, '', 'karkh', 'Governorates', 7]) {
    const data = outdoorSalesCoverage([{ id: 'unconfigured', full_name: 'Mohammad', username: 'mohd', outdoor_rotation_start_branch: seed, branch: 'Karkh' }], date);
    assert.deepEqual(data.staff, [{ id: 'unconfigured', name: 'Mohammad', branch: null }], 'Names and fixed branches must not grant a monthly assignment');
  }
});

test('coverage supports an empty roster without inventing staff', () => {
  const date = new Date('2026-10-20T12:00:00+03:00');
  assert.deepEqual(outdoorSalesCoverage([], date), { asOf: date.toISOString(), staff: [] });
});

function fixedDate(instant) {
  return class extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
  };
}

const roster = [
  { ...profiles[0], role: 'Outdoor Sales', is_active: true, status: 'Active', email: 'hidden@example.invalid', password_hash: 'private-hash', phone: 'private-phone' },
  { ...profiles[1], role: 'Outdoor Sales', is_active: true, status: 'Active' },
  { id: 'new-unconfigured', full_name: null, username: ' new.employee ', outdoor_rotation_start_branch: null, role: 'Outdoor Sales', is_active: true, status: 'Active' },
  { ...profiles[0], id: 'inactive-outdoor', is_active: false, status: 'Active', role: 'Outdoor Sales' },
  { ...profiles[0], id: 'disabled-outdoor', is_active: true, status: 'Inactive', role: 'Outdoor Sales' },
  { ...profiles[0], id: 'indoor', is_active: true, status: 'Active', role: 'Indoor Sales' },
  { ...profiles[0], id: 'sales-manager', is_active: true, status: 'Active', role: 'Sales Manager' },
];

function endpointFixture({ role = 'Admin', authStatus, rows = roster, error = null, DateClass = fixedDate('2026-10-15T21:00:00.000Z') } = {}) {
  const reads = [], authorizations = [];
  let clientCreations = 0;
  const route = load(routePath, {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/auth/adminServer': { requireRole: async allowed => {
      authorizations.push([...allowed]);
      assert.deepEqual([...allowed].sort(), [...leaderRoles].sort(), 'Coverage may be authorized only for the four leadership roles');
      return authStatus || !allowed.includes(role)
        ? { ok: false, status: authStatus ?? 403, error: 'Access denied' }
        : { ok: true, role, user: { id: 'leader' } };
    } },
    '@/lib/supabase/admin': { createAdminClient: () => {
      clientCreations++;
      return { from(table) {
        const read = { table, selected: null, filters: [] };
        reads.push(read);
        return {
          select(columns) { read.selected = columns; return this; },
          eq(column, value) { read.filters.push([column, value]); return this; },
          order() { return this; },
          then(resolve, reject) {
            const data = rows.filter(row => read.filters.every(([column, value]) => row[column] === value));
            return Promise.resolve({ data, error }).then(resolve, reject);
          },
        };
      } };
    } },
  }, DateClass);
  return { route, reads, authorizations, get clientCreations() { return clientCreations; } };
}

for (const role of appRoles.filter(role => !leaderRoles.includes(role))) {
  test(`${role} cannot read the outdoor coverage roster`, async () => {
    const x = endpointFixture({ role });
    const result = await x.route.GET();
    assert.equal(result.status, 403);
    assert.deepEqual(result.body, { error: 'Access denied' });
    assert.equal(x.clientCreations, 0);
    assert.deepEqual(x.reads, []);
    assert.equal(x.authorizations.length, 1);
  });
}

for (const authStatus of [401, 403]) {
  test(`coverage refuses missing or inactive authentication (${authStatus}) before querying profiles`, async () => {
    const x = endpointFixture({ authStatus });
    const result = await x.route.GET();
    assert.equal(result.status, authStatus);
    assert.deepEqual(result.body, { error: 'Access denied' });
    assert.equal(x.clientCreations, 0);
    assert.deepEqual(x.reads, []);
  });
}

for (const role of leaderRoles) {
  test(`${role} can read active Outdoor coverage with minimized employee data`, async () => {
    const x = endpointFixture({ role });
    const result = await x.route.GET();
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      asOf: '2026-10-15T21:00:00.000Z',
      staff: [
        { id: 'west-starter', name: 'Another employee', branch: 'Rasafa' },
        { id: 'east-starter', name: 'موظف آخر', branch: 'Karkh' },
        { id: 'new-unconfigured', name: 'new.employee', branch: null },
      ],
    });
    assert.equal(x.clientCreations, 1);
    assert.equal(x.reads.length, 1);
    assert.equal(x.reads[0].table, 'profiles');
    assert.deepEqual(x.reads[0].selected.split(',').map(column => column.trim()).sort(), ['id', 'full_name', 'username', 'outdoor_rotation_start_branch'].sort());
    assert.deepEqual(x.reads[0].filters.map(pair => pair.join(':')).sort(), ['role:Outdoor Sales', 'is_active:true', 'status:Active'].sort());
    const headers = new Headers(result.headers);
    assert.match(headers.get('Cache-Control'), /private/);
    assert.match(headers.get('Cache-Control'), /no-store/);
    for (const value of ['hidden@example.invalid', 'private-hash', 'private-phone']) assert.equal(JSON.stringify(result.body).includes(value), false);
  });
}

test('a failed roster query returns 503 without a stale roster or private database details', async () => {
  const x = endpointFixture({ error: { message: 'Private database host and connection details', code: 'private-code' } });
  const result = await x.route.GET();
  assert.equal(result.status, 503);
  assert.deepEqual(Object.keys(result.body), ['error']);
  assert.equal(typeof result.body.error, 'string');
  assert.ok(result.body.error.length > 0);
  assert.equal(JSON.stringify(result.body).includes('Private database'), false);
  assert.equal(JSON.stringify(result.body).includes('private-code'), false);
  assert.match(new Headers(result.headers).get('Cache-Control'), /no-store/);
});

test('an empty active Outdoor directory returns an empty coverage roster', async () => {
  const x = endpointFixture({ rows: roster.filter(row => row.role !== 'Outdoor Sales') });
  const result = await x.route.GET();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.staff, []);
});

test('coverage timestamp and all employee assignments use one server instant across Baghdad midnight', async () => {
  let instants = 0;
  class BoundaryDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [instants++ === 0 ? '2026-10-15T20:59:59.999Z' : '2026-10-15T21:00:00.000Z']));
    }
  }
  const x = endpointFixture({ DateClass: BoundaryDate });
  const result = await x.route.GET();
  assert.equal(result.status, 200);
  assert.equal(result.body.asOf, '2026-10-15T20:59:59.999Z');
  assert.deepEqual(result.body.staff.map(employee => employee.branch), ['Karkh', 'Rasafa', null]);
  assert.equal(instants, 1, 'Timestamp and branch calculations must share the same captured time');
});
