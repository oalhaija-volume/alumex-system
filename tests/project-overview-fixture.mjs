import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
 return { tables, reads, downloads, requestedRoles, route, load, get: (query = '?section=overview', id = projectId) => route.GET(new Request(`http://localhost:3003/api/projects/${id}${query}`), { params: Promise.resolve({ projectId: id }) }) };
}


export { fixture, project, quotation, projectId, otherId, reportId, actorId, timestamp };
