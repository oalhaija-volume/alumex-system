import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const projectId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const timestamp = '2026-11-26T08:00:00Z';

function moduleLoader(dependencies) {
 const cache = new Map();
 return function load(path) {
  if (cache.has(path)) return cache.get(path);
  const exports = {};
  cache.set(path, exports);
  const source = ts.transpileModule(readFileSync(new URL(`../${path}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', source)(name => {
   if (name in dependencies) return dependencies[name];
   if (name.startsWith('./')) return load(`${path.slice(0, path.lastIndexOf('/'))}/${name.slice(2)}`);
   assert.ok(name.startsWith('@/'), `Unexpected dependency ${name}`);
   return load(`src/${name.slice(2)}`);
  }, exports);
  return exports;
 };
}

function project(overrides = {}) {
 return { id: projectId, client_id: 'client', project_name: 'Project overview fixture', project_number: 'PRJ-202611-0262', branch: 'Karkh', governorate: null, governorate_office: null, archived_at: null, created_by: 'creator', assigned_outdoor_sales_id: 'measurer', follow_up_owner_id: 'indoor', legacy_outdoor_sales_id: null, measurement_delayed_by: null, client_cancelled_by: null, structure_readiness: 'ready', sales_status: 'transferred_to_operations', status: 'Contract', next_follow_up_at: timestamp, project_notes: 'Latest saved follow-up', address: 'Baghdad', created_at: timestamp, updated_at: timestamp, ...overrides };
}

function quotation(total) {
 return { lines: [], total, currency: 'IQD', createdAt: timestamp, preparedBy: 'indoor', version: 4 };
}

function fixture({ role = 'Branch Manager', branch = 'Karkh', authStatus = null, row = project(), errors = {}, tables: additions = {}, serviceAvailable = true } = {}) {
 const reads = [], downloads = [], requestedRoles = [];
 const currentQuote = quotation(111), signedQuote = quotation(222);
 const contract = { number: 'CT-FROZEN', createdAt: timestamp, quotation: signedQuote, terms: [], client: { name: 'Signed client', mobile: null, client_type: 'individual' }, project: { name: 'Signed project', number: 'PRJ-SIGNED', address: 'Baghdad' }, evidence: { path: `${projectId}/nested-private-path` } };
 const tables = {
  projects: row ? [row] : [],
  clients: [{ id: 'client', client_name: 'Current client', mobile: '07700000000', alternate_mobile: '07800000000', email: 'current@example.invalid', client_type: 'individual', preferred_language: 'ar', notes: 'Client note' }],
  client_contacts: [],
  contract_document_revisions: [],
  openings: [{ id: 'opening', project_id: projectId, opening_code: 'OP-1', floor: 'GF', room: 'Office', width: 67, height: 39, quantity: 1, area_sqm: 0.261, opening_type: 'Window', opening_direction: 'Hinged', created_by: 'measurer', created_at: timestamp, curtain_wall_capture: { note: 'Saved facade note', photo: 'data:image/png;base64,PHOTO' }, skylight_capture: { drawing: 'data:image/png;base64,DRAWING', sections: [] }, notes: 'Opening note' }],
  sales_workflows: [{ project_id: projectId, revision: 8, stage: 'signed', quotation: currentQuote, contract, evidence: { method: 'upload', signer: 'Saved signer', path: `${projectId}/private-signed-file`, fileName: 'signed.pdf' }, signed_at: timestamp, accepted_at: null, accepted_by: null }],
  quotation_revisions: [{ project_id: projectId, version: 1, quotation: quotation(99), contract: { ...contract, evidence: { path: 'history-private-path' } }, previous_stage: 'quotation', superseded_at: timestamp }],
  measurement_completion_reports: [{ id: reportId, project_id: projectId, note: 'Measurement note', photo: 'PRIVATE_REPORT_PHOTO', has_photo: true, recorded_by: 'measurer', recorded_by_name: 'Measurer', recorded_at: timestamp }],
  opening_size_history: [],
  field_sync_receipts: [],
  profiles: [{ id: 'creator', full_name: 'Original creator', username: null }, { id: 'measurer', full_name: 'Measurement employee', username: null }, { id: 'indoor', full_name: null, username: 'indoor.employee' }],
  ...additions,
 };
 const admin = {
  from(table) {
   assert.ok(table in tables, `Unexpected table ${table}`);
   const predicates = [], orders = [];
   let fields = '*', single = false, range;
   const query = {
    select(value) { fields = value; return this; },
    eq(key, value) { predicates.push(row => row[key] === value); return this; },
    is(key, value) { predicates.push(row => row[key] === value); return this; },
    in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
    or(expression) {
     assert.match(expression, /^project_id\.is\.null,project_id\.eq\.[0-9a-f-]+$/);
     const id = expression.split('project_id.eq.')[1];
     predicates.push(row => row.project_id === null || row.project_id === id);
     return this;
    },
    order(key, options = {}) { orders.push({ key, ascending: options.ascending !== false }); return this; },
    range(start, end) { range = [start, end]; return this; },
    maybeSingle() { single = true; return this; },
    then(resolve, reject) {
     let selected = tables[table].filter(row => predicates.every(predicate => predicate(row)));
     selected.sort((a, b) => {
      for (const { key, ascending } of orders) {
       if (a[key] < b[key]) return ascending ? -1 : 1;
       if (a[key] > b[key]) return ascending ? 1 : -1;
      }
      return 0;
     });
     if (range) selected = selected.slice(range[0], range[1] + 1);
     selected = selected.map(row => fields === '*' ? { ...row } : Object.fromEntries(fields.split(',').map(field => {
      const [name, source = name] = field.split(':'); return [name, row[source]];
     })));
     reads.push({ table, fields, rows: selected, range });
     return Promise.resolve({ data: errors[table] ? null : single ? selected[0] ?? null : selected, error: errors[table] ?? null }).then(resolve, reject);
    },
   };
   return query;
  },
  rpc() { throw new Error('Read-only overview must never call an RPC.'); },
  storage: { from(bucket) {
   assert.equal(bucket, 'signed-contracts-private');
   return { async download(path) { downloads.push(path); return { data: new Blob(['%PDF-saved-file'], { type: 'application/pdf' }), error: null }; } };
  } },
 };
 const load = moduleLoader({
  'server-only': {},
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/lib/auth/adminServer': { requireRole: async allowed => {
   requestedRoles.push(allowed);
   if (authStatus) return { ok: false, status: authStatus, error: 'Authentication denied.' };
   if (!allowed.includes(role)) return { ok: false, status: 403, error: 'Access denied.' };
   return { ok: true, role, user: { id: actorId }, profile: { branch, full_name: 'Overview reader', username: 'reader' } };
  } },
  '@/lib/supabase/admin': { createAdminClient: () => admin },
  '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => serviceAvailable },
 });
 const route = load('src/app/api/projects/[projectId]/route');
 return { tables, reads, downloads, requestedRoles, route, load, get: (query = '', id = projectId) => route.GET(new Request(`http://localhost:3003/api/projects/${id}${query}`), { params: Promise.resolve({ projectId: id }) }) };
}

test('Branch Manager reads the complete same-branch project without editing permissions or leaking storage paths', async () => {
 const x = fixture(); const before = structuredClone(x.tables);
 const response = await x.get(); const data = await response.json();
 assert.equal(response.status, 200);
 assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
 assert.equal(response.headers.get('X-Alumex-Actor'), actorId);
 assert.deepEqual(data.actor, { id: actorId, role: 'Branch Manager', name: 'Overview reader', branch: 'Karkh' });
 assert.equal(data.project.registeredBy, 'Original creator');
 assert.equal(data.project.assignedOutdoorSales, 'Measurement employee');
 assert.equal(data.project.followUpOwner, 'indoor.employee');
 assert.equal(data.client.name, 'Current client');
 assert.equal(data.client.alternate_mobile, '07800000000');
 assert.equal(data.openings[0].width, 67);
 assert.equal(data.openings[0].recordedBy, 'Measurement employee');
 assert.equal(data.openings[0].curtain_wall_capture.note, 'Saved facade note');
 assert.equal(data.openings[0].skylight_capture.drawing, 'data:image/png;base64,DRAWING');
 assert.equal(data.flow.quotation.total, 111);
 assert.equal(data.flow.contract.quotation.total, 222, 'The frozen signed quote remains distinct from the current quotation');
 assert.equal(data.history[0].quotation.total, 99);
 assert.equal(data.flow.evidence.signer, 'Saved signer');
 assert.equal(data.signedCopyAvailable, true);
 assert.equal(data.measurementReports[0].has_photo, true);
 assert.equal('photo' in data.measurementReports[0], false, 'Large report photos are loaded only on request');
 assert.doesNotMatch(JSON.stringify(data), /private-path|private-signed-file|PRIVATE_REPORT_PHOTO/);
 assert.deepEqual(x.tables, before, 'Rendering/read projection must preserve all stored snapshots');
 assert.equal(x.reads[0].table, 'projects');
 assert.equal(x.downloads.length, 0);
 assert.deepEqual(Object.keys(x.route), ['GET'], 'No mutation handler is introduced');
 const permissions = x.load('src/lib/auth/permissions');
 assert.equal(permissions.canPrepareQuotation('Branch Manager'), false);
 assert.equal(permissions.canAccessCRM('Branch Manager'), false);
 assert.equal(permissions.canAccessRoute(`/quotation/${projectId}`, 'Branch Manager'), false);
 assert.equal(permissions.canAccessRoute(`/contract/${projectId}`, 'Branch Manager'), false);
 assert.equal(permissions.canAccessRoute(`/projects/${projectId}`, 'Branch Manager'), true);
 const commercial = await x.load('src/lib/workflow/access').salesProject(projectId, 'commercial');
 assert.equal(commercial.response.status, 403, 'Overview permission does not grant access to sales workflow writes');
});

for (const role of ['Admin', 'Sales Director', 'Company Owner']) test(`${role} can review a project across branch boundaries`, async () => {
 const x = fixture({ role, branch: 'Rasafa', row: project({ branch: 'Najaf' }) });
 assert.equal((await x.get()).status, 200);
});

for (const query of ['', `?report=${reportId}`, '?download=signed']) test(`foreign Branch Manager cannot read project dependencies ${query || '(overview)'}`, async () => {
 const x = fixture({ branch: 'Rasafa' });
 assert.equal((await x.get(query)).status, 404);
 assert.deepEqual(x.reads.map(read => read.table), ['projects']);
 assert.equal(x.downloads.length, 0);
});

for (const scenario of [
 { label: 'Karkh includes its governorates office', actor: 'Karkh', project: { branch: 'Governorates', governorate: 'بابل' }, allowed: true },
 { label: 'Najaf retains legacy governorates geography', actor: 'Najaf', project: { branch: 'Governorates', governorate: 'النجف' }, allowed: true },
 { label: 'Karkh cannot inherit an unmarked legacy Najaf project', actor: 'Karkh', project: { branch: 'Governorates', governorate: 'النجف' }, allowed: false },
 { label: 'Karkh retains its explicitly registered Najaf governorates project', actor: 'Karkh', project: { branch: 'Governorates', governorate: 'النجف', governorate_office: 'Karkh' }, allowed: true },
 { label: 'Najaf cannot inherit Karkh governorates office records', actor: 'Najaf', project: { branch: 'Governorates', governorate: 'النجف', governorate_office: 'Karkh' }, allowed: false },
 { label: 'unassigned branch has no project visibility', actor: null, project: {}, allowed: false },
]) test(`Branch Manager scope: ${scenario.label}`, async () => {
 const x = fixture({ branch: scenario.actor, row: project(scenario.project) });
 assert.equal((await x.get()).status, scenario.allowed ? 200 : 404);
 if (!scenario.allowed) assert.deepEqual(x.reads.map(read => read.table), ['projects']);
});

test('CEO retains existing branch scope rather than receiving a new global bypass', async () => {
 assert.equal((await fixture({ role: 'CEO', branch: 'Rasafa' }).get()).status, 404);
 assert.equal((await fixture({ role: 'CEO', branch: 'Karkh' }).get()).status, 200);
});

for (const role of ['Operations Manager', 'Project Manager', 'Indoor Sales', 'Outdoor Sales', 'Finance / Accountant']) test(`${role} cannot use the leadership overview endpoint`, async () => {
 const x = fixture({ role });
 assert.equal((await x.get()).status, 403);
 assert.deepEqual(x.reads, []);
});

test('unauthenticated, invalid, archived and missing projects fail before related data reads', async () => {
 const unauthenticated = fixture({ authStatus: 401 });
 assert.equal((await unauthenticated.get()).status, 401); assert.deepEqual(unauthenticated.reads, []);
 const invalid = fixture();
 assert.equal((await invalid.get('', 'not-a-valid-project-id')).status, 404); assert.deepEqual(invalid.reads, []);
 for (const row of [null, project({ archived_at: timestamp })]) {
  const x = fixture({ row }); assert.equal((await x.get()).status, 404); assert.deepEqual(x.reads.map(read => read.table), ['projects']);
 }
 const unavailable = fixture({ serviceAvailable: false });
 assert.equal((await unavailable.get()).status, 503); assert.deepEqual(unavailable.reads, []);
});

test('contacts are limited to this project and general contacts of its own client', async () => {
 const x = fixture({ tables: { client_contacts: [
  { id: 'general', client_id: 'client', project_id: null, is_primary: true },
  { id: 'this-project', client_id: 'client', project_id: projectId, is_primary: false },
  { id: 'other-project', client_id: 'client', project_id: otherId, is_primary: false },
  { id: 'other-client', client_id: 'foreign-client', project_id: null, is_primary: false },
 ] } });
 const data = await (await x.get()).json();
 assert.deepEqual(data.contacts.map(contact => contact.id), ['general', 'this-project']);
});

test('the project overview includes only its public document revisions and preserves the original signed contract', async () => {
 const revision = { id: reportId, project_id: projectId, document_revision: 1, source_workflow_revision: 8, source_signed_at: timestamp,
  source_contract: { number: 'PRIVATE_SOURCE_CONTRACT', path: 'PRIVATE_STORAGE_PATH' }, contract: { number: 'CT-FROZEN-R1', quotation: quotation(222), terms: [] },
  format_version: 'billable-opening-schedule-v1', status: 'pending_approval', revision: 1, created_by: actorId, created_at: timestamp, approved_by: null, approved_at: null, signed_at: null, evidence: null };
 const x = fixture({ tables: { contract_document_revisions: [revision, { ...revision, id: otherId, project_id: otherId }] } });
 const before = structuredClone(x.tables);
 const response = await x.get(); const data = await response.json();
 assert.equal(response.status, 200);
 assert.deepEqual(data.documentRevisions.map(row => row.id), [reportId]);
 assert.equal(data.documentRevisions[0].contract.number, 'CT-FROZEN-R1');
 assert.equal(data.documentRevisions[0].evidence, null);
 assert.equal(data.flow.contract.number, 'CT-FROZEN');
 assert.equal(data.flow.evidence.signer, 'Saved signer');
 assert.doesNotMatch(JSON.stringify(data.documentRevisions), /PRIVATE_SOURCE_CONTRACT|PRIVATE_STORAGE_PATH|source_contract/);
 assert.deepEqual(x.tables, before);
});

test('measurement photo reads are scoped to the authorized project and report', async () => {
 const x = fixture({ tables: { measurement_completion_reports: [
  { id: reportId, project_id: projectId, photo: 'OWN_PHOTO' },
  { id: otherId, project_id: otherId, photo: 'FOREIGN_PHOTO' },
 ] } });
 const response = await x.get(`?report=${reportId}`);
 assert.equal(response.status, 200); assert.deepEqual(await response.json(), { photo: 'OWN_PHOTO' });
 assert.deepEqual(x.reads.map(read => read.table), ['projects', 'measurement_completion_reports']);
 assert.equal((await x.get(`?report=${otherId}`)).status, 404);
 assert.equal((await x.get('?report=invalid')).status, 404);
});

test('signed upload downloads use only the current authorized workflow and keep its path private', async () => {
 const x = fixture();
 const response = await x.get('?download=signed');
 assert.equal(response.status, 200); assert.equal(await response.text(), '%PDF-saved-file');
 assert.equal(response.headers.get('Content-Type'), 'application/pdf');
 assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
 assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
 assert.deepEqual(x.downloads, [`${projectId}/private-signed-file`]);
 assert.deepEqual(x.reads.map(read => read.table), ['projects', 'sales_workflows']);
 const bad = fixture(); bad.tables.sales_workflows[0].evidence.path = `${otherId}/foreign-signed-file`;
 assert.equal((await bad.get('?download=signed')).status, 404); assert.deepEqual(bad.downloads, []);
 for (const path of [`${projectId}/../${otherId}/file`, `${projectId}/%2e%2e%2fforeign`, `${projectId}/..`, `${projectId}/`]) {
  const unsafe = fixture(); unsafe.tables.sales_workflows[0].evidence.path = path;
  assert.equal((await unsafe.get('?download=signed')).status, 404); assert.deepEqual(unsafe.downloads, []);
 }
 for (const evidence of [null, { method: 'hard_copy', signer: 'Signer' }]) {
  const empty = fixture(); empty.tables.sales_workflows[0].evidence = evidence;
  assert.equal((await empty.get('?download=signed')).status, 404); assert.deepEqual(empty.downloads, []);
 }
});

test('follow-up and measurement history retain authors, types and honest fallback dates', async () => {
 const x = fixture({ tables: { field_sync_receipts: [
  { operation_id: 'follow-up', project_id: projectId, actor_id: 'indoor', action: 'follow-up', recorded_at: timestamp, result: { project_notes: 'Called client', next_follow_up_at: timestamp, follow_up_type: 'call', follow_up_owner_name: 'Saved owner' } },
  { operation_id: 'delay', project_id: projectId, actor_id: 'measurer', action: 'delay-measurements', recorded_at: timestamp, result: { measurement_delay_note: 'Client postponed', measurement_delay_reason: 'client_delay' } },
 ] } });
 const data = await (await x.get()).json();
 assert.equal(data.followUps.entries.length, 1);
 assert.equal(data.followUps.entries[0].note, 'Called client');
 assert.equal(data.followUps.entries[0].recordedBy, 'indoor.employee');
 assert.equal(data.followUps.entries[0].followUpType, 'call');
 assert.equal(data.project.measurement_attempts[0].note, 'Client postponed');
 assert.equal(data.project.measurement_attempts[0].recordedBy, 'Measurement employee');
 const fallback = await (await fixture().get()).json();
 assert.equal(fallback.followUps.entries[0].action, 'snapshot');
 assert.equal(fallback.followUps.entries[0].recordedAt, null);
 assert.equal(fallback.followUps.entries[0].recordedBy, 'Not recorded');
});

test('history pagination preserves follow-ups beyond the first response page', async () => {
 const x = fixture({ tables: { field_sync_receipts: Array.from({ length: 1001 }, (_, index) => ({ operation_id: `follow-${String(index).padStart(4, '0')}`, project_id: projectId, actor_id: 'indoor', action: 'follow-up', recorded_at: timestamp, result: { project_notes: `Note ${index}` } })) } });
 const data = await (await x.get()).json();
 assert.equal(data.followUps.entries.length, 1001);
 assert.equal(data.followUps.entries.at(-1).note, 'Note 1000');
});

for (const code of ['42P01', 'PGRST205']) test(`known legacy missing tables (${code}) produce explicit partial-data warnings`, async () => {
 const optional = ['client_contacts', 'sales_workflows', 'quotation_revisions', 'measurement_completion_reports', 'opening_size_history', 'field_sync_receipts'];
 const x = fixture({ errors: Object.fromEntries(optional.map(table => [table, { code, message: 'Missing table' }])) });
 const response = await x.get(); const data = await response.json();
 assert.equal(response.status, 200);
 assert.equal(data.flow, null); assert.deepEqual(data.history, []); assert.deepEqual(data.measurementReports, []);
 assert.ok(data.warnings.length >= 6);
 assert.equal(data.signedCopyAvailable, false);
 assert.equal((await x.get('?download=signed')).status, 404);
 assert.equal((await x.get(`?report=${reportId}`)).status, 404);
});

for (const table of ['projects', 'openings', 'clients', 'profiles', 'sales_workflows', 'quotation_revisions', 'field_sync_receipts', 'measurement_completion_reports']) test(`${table} database errors are surfaced instead of pretending data is absent`, async () => {
 const x = fixture({ errors: { [table]: { code: '42501', message: 'PRIVATE_DATABASE_ERROR' } } });
 const response = await x.get();
 assert.equal(response.status, 500);
 assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE_DATABASE_ERROR/);
});
