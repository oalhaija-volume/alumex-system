import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function modules(dependencies = {}) {
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', source)(name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      return load(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url));
    }, exports);
    return exports;
  }
  return path => load(new URL(`../src/${path}.ts`, import.meta.url));
}

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const teammateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const openingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const version = '2026-11-04T08:00:00Z';
const actor = { id: actorId, role: 'Outdoor Sales', outdoorTeamMemberIds: [actorId, teammateId] };
const openingInput = { id: openingId, floor: 'GF', room: 'Kitchen', otherRoom: '', width: 100, height: 200, quantity: 1, structuralType: 'Window', openingType: 'Sliding' };

function fixture({ role = 'Outdoor Sales', openingCreator = actorId, projectCreator = teammateId, missingOpening = false, openingError = null } = {}) {
  const project = { id: projectId, project_name: 'Shared measurements', project_number: 'PRJ-OWNERSHIP', created_by: projectCreator,
    assigned_outdoor_sales_id: teammateId, branch: 'Karkh', structure_readiness: 'ready', sales_status: 'new_lead', updated_at: version };
  const storedOpening = { id: openingId, project_id: projectId, created_by: openingCreator, floor: 'GF', room: 'Kitchen',
    width: 100, height: 200, quantity: 1, opening_type: 'Window', opening_direction: 'Sliding' };
  const reads = [], writes = [], calls = [];
  const admin = {
    from(table) {
      const filters = [];
      let mutation;
      const query = {
        select(fields) { reads.push({ table, fields }); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        in(key, values) { filters.push([key, values]); return this; },
        order() { return this; },
        insert(payload) { mutation = payload; return this; },
        async maybeSingle() {
          if (table === 'projects') return { data: project, error: null };
          assert.equal(table, 'openings');
          assert.ok(filters.some(([key, value]) => key === 'project_id' && value === projectId), 'Ownership lookup must be scoped to this project');
          return { data: missingOpening ? null : storedOpening, error: openingError };
        },
        then(resolve, reject) {
          if (mutation) writes.push({ table, payload: mutation });
          return Promise.resolve({ data: table === 'openings' ? [storedOpening] : [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return { data: project, error: null }; },
  };
  const auth = { ok: true, role, user: { id: actorId }, profile: { branch: 'Karkh' }, outdoorTeamMemberIds: actor.outdoorTeamMemberIds };
  const load = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async () => auth },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  });
  return { load, project, storedOpening, reads, writes, calls };
}

const request = body => ({ json: async () => body });
const context = { params: Promise.resolve({ projectId }) };
const edit = { action: 'edit-opening', operationId: openingId, previous: openingInput, opening: { ...openingInput, width: 125 } };

test('shared measurement visibility does not grant another employee’s project-name or opening ownership', () => {
  const load = modules();
  const { canRenameProject } = load('lib/workflow/projectName');
  const { canEditOpeningEntry } = load('lib/measurements/openingOwnership');
  const { measurementTasks } = load('lib/workflow/salesTasks');
  const shared = fixture().project;
  assert.deepEqual(measurementTasks([shared], actor).map(project => project.id), [projectId]);
  assert.equal(canRenameProject(shared, actor), false);
  assert.equal(canRenameProject({ ...shared, created_by: actorId }, actor), false);
  assert.equal(canEditOpeningEntry({ createdBy: teammateId }, actor), false);
  assert.equal(canEditOpeningEntry({ createdBy: actorId }, actor), true);
  assert.equal(canEditOpeningEntry({}, actor), false, 'Old entries without an author must not be attributed to the assignee');
  assert.equal(canEditOpeningEntry({ createdBy: null }, actor), false);
  assert.equal(canEditOpeningEntry({ createdBy: actorId }, undefined, 'Outdoor Sales'), false);
  for (const role of ['Indoor Sales', 'Sales Manager', 'Admin']) {
    assert.equal(canEditOpeningEntry({ createdBy: teammateId }, { id: actorId, role }), true);
  }
});

test('the measurement download identifies authors using stored opening ownership', async () => {
  const x = fixture({ openingCreator: teammateId });
  const response = await x.load('app/api/initial-measurements/[projectId]/route').GET(request(), context);
  assert.equal(response.status, 200);
  assert.equal(response.body.openings[0].createdBy, teammateId);
  assert.ok(x.reads.find(read => read.table === 'openings').fields.includes('created_by'));
});

test('a teammate can add an opening, but its author always comes from the verified account', async () => {
  const x = fixture();
  const response = await x.load('app/api/initial-measurements/[projectId]/route').POST(request({ ...openingInput, createdBy: teammateId, created_by: teammateId }), context);
  assert.equal(response.status, 201);
  assert.equal(x.writes.length, 1);
  assert.equal(x.writes[0].payload.created_by, actorId);
  assert.equal(Object.hasOwn(x.writes[0].payload, 'createdBy'), false);
});

test('Outdoor Sales can edit their own stored opening inside a teammate assignment', async () => {
  const x = fixture();
  const response = await x.load('app/api/initial-measurements/[projectId]/route').PATCH(request(edit), context);
  assert.equal(response.status, 200);
  assert.equal(x.calls.length, 1);
  assert.equal(x.calls[0].args.p_actor, actorId);
  assert.equal(x.calls[0].args.p_action, 'edit-opening');
  assert.equal(x.calls[0].args.p_payload.opening.width, 125);
});

for (const openingCreator of [teammateId, null, undefined]) test(`stored author ${openingCreator ?? 'missing'} cannot be overridden by forged opening ownership`, async () => {
  const x = fixture({ openingCreator });
  if (openingCreator === undefined) delete x.storedOpening.created_by;
  const forged = { ...edit, userId: actorId, created_by: actorId, createdBy: actorId,
    previous: { ...edit.previous, created_by: actorId, createdBy: actorId }, opening: { ...edit.opening, created_by: actorId, createdBy: actorId } };
  const response = await x.load('app/api/initial-measurements/[projectId]/route').PATCH(request(forged), context);
  assert.equal(response.status, 403);
  assert.equal(x.calls.length + x.writes.length, 0);
});

test('a missing or unreadable author row cannot produce an edit mutation', async () => {
  for (const options of [{ missingOpening: true }, { openingError: { message: 'Private database detail' } }]) {
    const x = fixture(options);
    const response = await x.load('app/api/initial-measurements/[projectId]/route').PATCH(request(edit), context);
    assert.ok(response.status >= 400);
    assert.equal(x.calls.length + x.writes.length, 0);
    assert.equal(JSON.stringify(response).includes('Private database detail'), false);
  }
});

for (const role of ['Indoor Sales', 'Sales Manager', 'Admin']) test(`${role} retains its existing opening-edit workflow`, async () => {
  const x = fixture({ role, openingCreator: teammateId });
  const response = await x.load('app/api/initial-measurements/[projectId]/route').PATCH(request(edit), context);
  assert.equal(response.status, 200);
  assert.equal(x.calls.length, 1);
});

test('neither a shared Outdoor assignee nor its real creator can rename a project', async () => {
  for (const projectCreator of [teammateId, actorId]) {
    const x = fixture({ projectCreator });
    const response = await x.load('app/api/workspace/route').PATCH(request({
      projectId, action: 'rename-project', projectName: 'Reviewed project', expectedUpdatedAt: version,
      created_by: actorId, original_creator_id: actorId, outdoorTeamMemberIds: [actorId, teammateId],
    }));
    assert.equal(response.status, 403);
    assert.equal(x.calls.length, 0);
  }
});

test('measurement edit normalization never accepts creator fields as editable data', () => {
  const { normalizeOpeningEdit } = modules()('lib/measurements/registrationOpening');
  const normalized = normalizeOpeningEdit({
    ...edit, previous: { ...openingInput, createdBy: teammateId },
    opening: { ...edit.opening, createdBy: actorId, created_by: actorId },
  });
  for (const value of [normalized.previous, normalized.opening]) {
    assert.equal(Object.hasOwn(value, 'createdBy'), false);
    assert.equal(Object.hasOwn(value, 'created_by'), false);
  }
});
