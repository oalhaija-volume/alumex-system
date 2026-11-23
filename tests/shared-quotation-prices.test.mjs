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
      assert.ok(name.startsWith('@/') || name.startsWith('.'), `Unexpected dependency: ${name}`);
      return load(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url));
    }, exports);
    return exports;
  }
  return path => load(new URL(`../src/${path}.ts`, import.meta.url));
}

const load = modules();
const { reviseSharedQuotationPrices } = load('lib/quotations/sharedPrices');
const { applyQuotationDiscount, QUOTATION_DISCOUNTS_ENABLED } = load('lib/workflow/pricing');
const projectId = '40899d11-d82d-483b-b028-9b1313593ca2';
const employeeId = 'b1527c5b-dfee-4336-ae1b-88acf76a5060';
const originalAuthor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const catalog = [
  { id: 'alumex', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 260000, is_active: true },
  { id: 'curtain', name: 'Curtain Wall', category: 'facade_service', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'photocell', name: 'Photocell Door', category: 'standalone_product', unit: 'item', unit_price: 1000000, is_active: true },
];
const charge = (id, name, rate, quantity, fields = {}) => ({ id, name, unit: 'sqm', rate, quantity, total: Math.round(rate * quantity), ...fields });

function snapshot() {
  const glass = charge('glass', 'Saint Gobain Glass', 30000, 3);
  const extra = charge('tilt', 'Tilt & Turn', 15000, 2, { unit: 'item' });
  return {
    branch: 'Rasafa', governorate: null, currency: 'IQD', version: 1,
    createdAt: '2026-11-20T09:00:00Z', preparedBy: originalAuthor,
    pricingPolicy: { curtainWallMinimumRate: 210000 },
    excludedOpeningIds: ['excluded-opening'], skylightsPricedSeparately: true,
    openingSizeChanges: [{ openingId: 'window', reason: 'Saved historical correction', previousWidth: 140, width: 150 }],
    facadeMeasurements: [{ id: 'facade', floor: 'GF', room: 'Facade', width: 400, height: 300, quantity: 1, opening_type: 'Facade' }],
    lines: [
      {
        opening: { id: 'window', floor: 'GF', room: 'Office', width: 150, height: 100, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding' },
        area: 3, systemModel: 'model-1', system: charge('alumex', 'Saved Alumex specification', 260000, 3),
        glass, extras: [extra], total: 900000,
      },
      {
        opening: { id: 'wall', floor: 'GF', room: 'North', width: 300, height: 200, quantity: 1, opening_type: 'Curtain Wall', opening_direction: null },
        area: 6, curtainWallGlassType: 'double', system: charge('curtain', 'Saved Curtain Wall specification', 250000, 6),
        glass: null, extras: [], total: 1500000,
      },
    ],
    additionalItems: [
      charge('curtain', 'Curtain Wall', 250000, 3, {
        curtainWallGlassType: 'single', measurements: [{ label: 'South', width: 1.5, height: 2, quantity: 1 }],
        extras: [charge('pushout', 'Curtain Wall Pushout', 10000, 1, { unit: 'item' })],
      }),
      charge('photocell', 'Photocell Door', 1000000, 1, { unit: 'item', projectAddon: true }),
    ],
    total: 4160000,
  };
}

function prices(saved = snapshot()) {
  return {
    systemRates: saved.lines.map(line => ({ openingId: line.opening.id, rate: line.system.rate })),
    additionalRates: (saved.additionalItems ?? []).map(item => ({ id: item.id, rate: item.rate })),
  };
}
function edited(saved = snapshot()) {
  const input = prices(saved);
  input.systemRates[0].rate = 270000;
  return input;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('shared revisions change only permitted rates, derived amounts and new author metadata', () => {
  const saved = freeze(snapshot());
  const before = structuredClone(saved);
  const input = edited(saved);
  input.systemRates[1].rate = 240000;
  input.additionalRates[0].rate = 220000;
  const inputBefore = structuredClone(input);
  const result = reviseSharedQuotationPrices(saved, input, freeze(structuredClone(catalog)), employeeId);
  assert.deepEqual(saved, before, 'Saved quotation and history metadata are immutable');
  assert.deepEqual(input, inputBefore, 'Request arrays are not rewritten');
  assert.equal(result.total, 4040000);
  assert.equal(result.lines[0].total, 930000);
  assert.equal(result.lines[1].total, 1440000);
  assert.equal(result.additionalItems[0].total, 660000);
  assert.equal(result.preparedBy, employeeId);
  assert.ok(Number.isFinite(Date.parse(result.createdAt)));
  assert.notEqual(result.createdAt, saved.createdAt);
  for (const key of ['branch', 'governorate', 'currency', 'version', 'pricingPolicy', 'excludedOpeningIds', 'openingSizeChanges', 'facadeMeasurements', 'skylightsPricedSeparately']) {
    assert.deepEqual(result[key], saved[key], key);
  }
  result.lines.forEach((line, index) => {
    const original = saved.lines[index];
    for (const key of ['opening', 'area', 'systemModel', 'curtainWallGlassType', 'glass', 'extras']) assert.deepEqual(line[key], original[key], key);
    for (const key of ['id', 'name', 'unit', 'quantity']) assert.equal(line.system[key], original.system[key], key);
    assert.equal(line.system.rateSource, 'quotation');
  });
  for (const key of ['measurements', 'curtainWallGlassType', 'extras', 'quantity', 'name']) assert.deepEqual(result.additionalItems[0][key], saved.additionalItems[0][key], key);
  assert.deepEqual(result.additionalItems[1], saved.additionalItems[1], 'Uneditable standalone product is preserved');
});

test('forged quotation metadata in request fields cannot replace saved specifications or policy', () => {
  const saved = snapshot();
  const result = reviseSharedQuotationPrices(saved, {
    ...edited(saved), branch: 'Karkh', pricingPolicy: { curtainWallMinimumRate: 1 }, preparedBy: 'forged',
    lines: [], total: 1, openingSizeChanges: [], additionalItems: [], quotation: { branch: 'Karkh' },
  }, catalog, employeeId);
  assert.equal(result.branch, 'Rasafa');
  assert.deepEqual(result.pricingPolicy, saved.pricingPolicy);
  assert.deepEqual(result.lines.map(line => line.opening), saved.lines.map(line => line.opening));
  assert.equal(result.preparedBy, employeeId);
});

test('shared edits enforce the ordinary system minimum and saved Curtain Wall exception only', () => {
  const saved = snapshot();
  const tooLow = edited(saved); tooLow.systemRates[0].rate = 239999;
  assert.throws(() => reviseSharedQuotationPrices(saved, tooLow, catalog, employeeId), /240,000/);
  const curtain = prices(saved); curtain.systemRates[1].rate = 210000; curtain.additionalRates[0].rate = 210000;
  assert.equal(reviseSharedQuotationPrices(saved, curtain, catalog, employeeId).lines[1].system.rate, 210000);
  curtain.systemRates[1].rate = 209999;
  assert.throws(() => reviseSharedQuotationPrices(saved, curtain, catalog, employeeId), /210,000/);
  const normal = snapshot(); delete normal.pricingPolicy;
  const normalPrices = prices(normal); normalPrices.systemRates[1].rate = 220000;
  assert.throws(() => reviseSharedQuotationPrices(normal, normalPrices, catalog, employeeId), /240,000/);
});

for (const [name, alter] of [
  ['missing system array', input => { delete input.systemRates; }],
  ['missing additional array', input => { delete input.additionalRates; }],
  ['missing line', input => input.systemRates.pop()],
  ['extra line', input => input.systemRates.push({ openingId: 'new', rate: 260000 })],
  ['foreign opening', input => { input.systemRates[0].openingId = 'other'; }],
  ['duplicate opening', input => { input.systemRates[1].openingId = input.systemRates[0].openingId; }],
  ['foreign standalone id', input => { input.additionalRates[0].id = 'other'; }],
  ['duplicate standalone id', input => { input.additionalRates[1].id = input.additionalRates[0].id; }],
  ['null row', input => { input.systemRates[0] = null; }],
  ['string rate', input => { input.systemRates[0].rate = '270000'; }],
  ['fractional rate', input => { input.systemRates[0].rate = 270000.5; }],
  ['zero rate', input => { input.systemRates[0].rate = 0; }],
  ['negative rate', input => { input.systemRates[0].rate = -1; }],
  ['NaN rate', input => { input.systemRates[0].rate = NaN; }],
  ['infinite rate', input => { input.systemRates[0].rate = Infinity; }],
  ['unsafe integer', input => { input.systemRates[0].rate = Number.MAX_SAFE_INTEGER + 1; }],
]) test(`shared rate request rejects ${name}`, () => {
  const saved = snapshot(), input = edited(saved); alter(input);
  assert.throws(() => reviseSharedQuotationPrices(saved, input, catalog, employeeId));
});

test('noneditable, removed, inactive, missing and unit-mismatched products cannot receive new prices', () => {
  const saved = snapshot();
  const input = prices(saved); input.additionalRates[1].rate = 1000001;
  assert.throws(() => reviseSharedQuotationPrices(saved, input, catalog, employeeId), /does not allow/);
  for (const product of [null, { ...catalog[0], is_active: false }, { ...catalog[0], unit: 'item' }, { ...catalog[0], name: 'Reynaers System' }, { ...catalog[0], name: 'Another system' }]) {
    const entries = [product, ...catalog.slice(1)].filter(Boolean);
    assert.throws(() => reviseSharedQuotationPrices(saved, edited(saved), entries, employeeId), /does not allow/);
  }
});

test('unchanged legacy products are retained and a no-change submission is rejected', () => {
  const saved = snapshot();
  assert.throws(() => reviseSharedQuotationPrices(saved, prices(saved), catalog, employeeId), /Change a quotation price/);
  const result = reviseSharedQuotationPrices(saved, edited(saved), catalog.slice(0, 2), employeeId);
  assert.deepEqual(result.additionalItems[1], saved.additionalItems[1]);
});

test('fractional saved quantities retain exact rounding and overflowing totals fail closed', () => {
  const saved = snapshot(); saved.lines[0].system.quantity = 0.5236;
  const result = reviseSharedQuotationPrices(saved, edited(saved), catalog, employeeId);
  assert.equal(result.lines[0].system.quantity, 0.5236);
  assert.equal(result.lines[0].system.total, Math.round(0.5236 * 270000));
  const huge = edited(); huge.systemRates[0].rate = Number.MAX_SAFE_INTEGER;
  assert.throws(() => reviseSharedQuotationPrices(snapshot(), huge, catalog, employeeId), /Invalid quotation amount/);
});

test('saved discounts follow the existing paused-discount behavior without mutating the historical snapshot', () => {
  const saved = applyQuotationDiscount(snapshot(), 5), before = structuredClone(saved);
  const result = reviseSharedQuotationPrices(saved, edited(saved), catalog, employeeId);
  assert.deepEqual(saved, before);
  assert.equal(Object.hasOwn(result, 'discount'), QUOTATION_DISCOUNTS_ENABLED);
});

const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers ?? {} }) } };

function fixture({ role = 'Indoor Sales', actorBranch = 'Karkh', branch = 'Rasafa', grant = true, grantError = null, authStatus = null, missingProject = false, projectError = null, serviceAvailable = true, flowChanges = {}, projectChanges = {}, mutationError = null, grantRows, tableError = null } = {}) {
  const calls = [], queries = [], authCalls = [];
  const project = { id: projectId, project_number: 'PRJ-202611-0452', project_name: 'Shared price fixture', client_id: 'client', branch, created_by: originalAuthor, follow_up_owner_id: originalAuthor, sales_status: 'quotation_in_progress', updated_at: '2026-11-23T10:00:00Z', ...projectChanges };
  const flow = { project_id: projectId, revision: 1, stage: 'quotation', quotation: snapshot(), contract: { private: 'contract' }, signed_at: null, evidence: null, accepted_at: null, accepted_by: null, ...flowChanges };
  const tables = { projects: missingProject ? [] : [project], sales_workflows: [flow], openings: flow.quotation.lines.map(line => ({ ...line.opening, project_id: projectId })), product_price_settings: catalog, clients: [{ id: 'client', name: 'Fixture client', mobile: '07000000000', client_type: 'individual' }], quotation_revisions: [{ project_id: projectId, version: 0, quotation: { old: true }, contract: { private: true } }], opening_size_history: [], project_quotation_price_access: grantRows ?? (grant ? [{ project_id: projectId, employee_id: employeeId, revoked_at: null }] : []) };
  const admin = {
    from(table) {
      assert.ok(table in tables, `Unexpected table ${table}`);
      const query = { table, filters: [] }; queries.push(query);
      function result(single = false) {
        const rows = tables[table].filter(row => query.filters.every(([operator, key, value]) => operator === 'in' ? value.includes(row[key]) : operator === 'is' ? value === null ? row[key] == null : row[key] === value : row[key] === value));
        const error = table === 'projects' ? projectError : table === 'project_quotation_price_access' ? tableError : null;
        return { data: single ? rows[0] ?? null : rows, error };
      }
      return {
        select(columns) { query.columns = columns; return this; },
        eq(key, value) { query.filters.push(['eq', key, value]); return this; },
        is(key, value) { query.filters.push(['is', key, value]); return this; },
        in(key, value) { query.filters.push(['in', key, value]); return this; },
        order() { return this; },
        async single() { return result(true); }, async maybeSingle() { return result(true); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'employee_has_quotation_price_access') return { data: grant, error: grantError };
      assert.equal(name, 'advance_sales_flow');
      return { data: { ...flow, quotation: args.p_payload, revision: 2 }, error: mutationError };
    },
    storage: { from() { assert.fail('Shared request must not access signed storage'); } },
  };
  const dependencies = {
    'next/server': next,
    '@/lib/contracts/uploadedTerms': {},
    '@/lib/auth/adminServer': { requireRole: async allowed => {
      authCalls.push([...allowed]);
      return authStatus ? { ok: false, status: authStatus, error: 'Denied' } : { ok: true, user: { id: employeeId }, role, profile: { branch: actorBranch, status: 'Active', is_active: true } };
    } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => serviceAvailable },
  };
  const compiled = modules(dependencies);
  const access = compiled('lib/workflow/access');
  const route = compiled('app/api/sales-flow/[projectId]/route');
  const discovery = compiled('app/api/shared-quotations/route');
  const context = { params: Promise.resolve({ projectId }) };
  return {
    calls, queries, authCalls, flow, project,
    access: (...args) => access.salesProject(projectId, ...args),
    get: (query = '') => route.GET(new Request(`http://localhost:3003/api/sales-flow/${projectId}${query}`), context),
    post: body => route.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), context),
    discover: () => discovery.GET(),
  };
}

test('same-branch commercial access keeps its ordinary full scope without consulting shared grants', async () => {
  const x = fixture({ branch: 'Karkh', grant: false });
  const result = await x.access('commercial');
  assert.equal(result.quotationAccess, 'full');
  assert.equal(result.project, x.project);
  assert.deepEqual(x.calls, []);
  const read = await x.get();
  assert.equal(read.status, 200); assert.equal(read.body.flow.contract.private, 'contract');
  assert.equal(read.body.history.length, 1);
});

test('cross-branch shared access requires commercial scope, explicit opt-in and active Indoor Sales role', async () => {
  for (const [scope, optIn] of [[false, false], [true, true], ['commercial', false]]) {
    const x = fixture(); const result = await x.access(scope, optIn);
    assert.equal(result.response.status, 404); assert.deepEqual(x.calls, []);
  }
  for (const role of ['Sales Manager', 'CEO', 'Outdoor Sales']) {
    const x = fixture({ role }); const result = await x.access('commercial', true);
    assert.equal(result.response.status, role === 'Outdoor Sales' ? 403 : 404);
    assert.deepEqual(x.calls, []);
  }
  const x = fixture(); const result = await x.access('commercial', true);
  assert.equal(result.quotationAccess, 'prices');
  assert.deepEqual(x.calls, [{ name: 'employee_has_quotation_price_access', args: { p_project: projectId, p_employee: employeeId } }]);
});

test('missing or errored grants and unavailable or unauthorized project access fail closed', async () => {
  for (const options of [{ grant: false }, { grantError: { code: 'DB' } }, { missingProject: true }, { projectError: { code: 'DB' } }, { authStatus: 401 }, { authStatus: 403 }, { serviceAvailable: false }]) {
    const x = fixture(options); const result = await x.access('commercial', true);
    assert.ok(result.response.status >= 400);
    assert.ok(!x.calls.some(call => call.name === 'advance_sales_flow'));
  }
});

test('shared quotation reads return saved quotation only and hide contract, evidence and history', async () => {
  const x = fixture({ flowChanges: { evidence: { method: 'upload', path: 'private-file' } } });
  const read = await x.get();
  assert.equal(read.status, 200);
  assert.equal(read.body.quotationAccess, 'prices');
  assert.equal(read.body.flow.contract, null); assert.deepEqual(read.body.flow.evidence, { recorded: true });
  assert.deepEqual(read.body.history, []); assert.deepEqual(read.body.sizeHistory, []);
  assert.equal(read.body.project.branch, 'Rasafa');
  assert.equal(Object.hasOwn(read.body.project, 'follow_up_owner_id'), false);
  assert.equal(Object.hasOwn(read.body.project, 'created_by'), false);
  assert.equal(read.headers['Cache-Control'], 'private, no-store');
  assert.equal((await x.get('?download=signed')).status, 403);
});

for (const action of ['save', 'approve', 'contract', 'sign', 'preview-prices', 'update-prices', 'set-discount', 'change-contract-template', 'save-contract-details', 'accept', undefined]) {
  test(`shared employee cannot invoke alternate action ${String(action)}`, async () => {
    const x = fixture();
    const result = await x.post({ action, revision: 1, confirmed: true, ...edited() });
    assert.equal(result.status, 403); assert.ok(!x.calls.some(call => call.name === 'advance_sales_flow'));
  });
}

test('shared save derives its whole payload from saved state and rechecks grant inside the database transaction', async () => {
  const x = fixture();
  const result = await x.post({ action: 'save-shared-prices', revision: 1, ...edited(), branch: 'Karkh', actorId: 'forged', quotation: { total: 1 }, pricingPolicy: { curtainWallMinimumRate: 1 } });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(x.calls.map(call => call.name), ['employee_has_quotation_price_access', 'advance_sales_flow']);
  const saved = x.calls[1].args;
  assert.equal(saved.p_project, projectId); assert.equal(saved.p_actor, employeeId); assert.equal(saved.p_action, 'save'); assert.equal(saved.p_revision, 1);
  assert.equal(saved.p_payload.branch, 'Rasafa'); assert.equal(saved.p_payload.preparedBy, employeeId);
  assert.deepEqual(saved.p_payload.pricingPolicy, x.flow.quotation.pricingPolicy);
  assert.deepEqual(saved.p_payload.lines.map(line => line.opening), x.flow.quotation.lines.map(line => line.opening));
  const revoked = fixture({ mutationError: { code: '42501', message: 'Project is not available to this employee' } });
  assert.equal((await revoked.post({ action: 'save-shared-prices', revision: 1, ...edited() })).status, 403, 'Database permission denial after the initial read is propagated');
});

test('shared save preserves revision, signed-workflow and additional-measurement locks', async () => {
  for (const options of [
    { flowChanges: { signed_at: '2026-11-23T10:00:00Z' } }, { flowChanges: { evidence: { method: 'hard_copy' } } },
    { flowChanges: { accepted_at: '2026-11-23T10:00:00Z' } }, { flowChanges: { accepted_by: 'manager' } },
    { flowChanges: { stage: 'signed' } }, { projectChanges: { sales_status: 'cancelled' } },
    { projectChanges: { sales_status: 'contract_signed' } }, { projectChanges: { sales_status: 'transferred_to_operations' } },
    { projectChanges: { additional_openings_state: 'requested' } }, { projectChanges: { additional_openings_state: 'submitted' } },
  ]) {
    const x = fixture(options);
    assert.equal((await x.post({ action: 'save-shared-prices', revision: 1, ...edited() })).status, 409);
    assert.ok(!x.calls.some(call => call.name === 'advance_sales_flow'));
  }
  const stale = fixture(); assert.equal((await stale.post({ action: 'save-shared-prices', revision: 0, ...edited() })).status, 409);
  const contract = fixture({ flowChanges: { stage: 'contract' } });
  assert.equal((await contract.post({ action: 'save-shared-prices', revision: 1, ...edited() })).status, 400);
  assert.equal((await contract.post({ action: 'save-shared-prices', revision: 1, replaceUnsignedContract: true, ...edited() })).status, 200);
});

test('shared discovery queries only active employee grants and hides ordinarily accessible projects', async () => {
  const x = fixture(); const read = await x.discover();
  assert.equal(read.status, 200); assert.equal(read.body.projects[0].id, projectId);
  assert.deepEqual(x.queries[0].filters, [['eq', 'employee_id', employeeId], ['is', 'revoked_at', null]]);
  assert.deepEqual(x.queries[1].filters, [['in', 'id', [projectId]], ['is', 'archived_at', null]]);
  assert.equal(read.headers['Cache-Control'], 'private, no-store');
  const normal = fixture({ branch: 'Karkh' }); assert.deepEqual((await normal.discover()).body.projects, []);
  const revoked = fixture({ grantRows: [{ project_id: projectId, employee_id: employeeId, revoked_at: '2026-11-23T10:00:00Z' }] });
  assert.deepEqual((await revoked.discover()).body.projects, []); assert.equal(revoked.queries.length, 1);
  const other = fixture({ grantRows: [{ project_id: projectId, employee_id: originalAuthor, revoked_at: null }] });
  assert.deepEqual((await other.discover()).body.projects, []);
});

test('discovery handles old installations and errors without exposing other employees or role scopes', async () => {
  for (const code of ['42P01', 'PGRST205']) {
    const x = fixture({ tableError: { code } });
    assert.deepEqual((await x.discover()).body.projects, []); assert.equal(x.queries.length, 1);
  }
  const error = fixture({ tableError: { code: 'OTHER' } }); assert.equal((await error.discover()).status, 500);
  for (const role of ['Admin', 'Sales Director', 'Sales Manager', 'Company Owner']) {
    const x = fixture({ role }); assert.deepEqual((await x.discover()).body.projects, []); assert.deepEqual(x.queries, []);
  }
  const denied = fixture({ authStatus: 401 }); assert.equal((await denied.discover()).status, 401); assert.deepEqual(denied.queries, []);
});
