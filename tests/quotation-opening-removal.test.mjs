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

const pricing = modules()('lib/workflow/pricing');
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ids = [1, 2, 3, 4, 5, 6].map(value => `${value}${'1'.repeat(7)}-1111-4111-8111-111111111111`);
const catalog = [
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 270000, is_active: true },
  { id: 'glass', name: 'Low-E Glass', category: 'addon', unit: 'sqm', unit_price: 30000, is_active: true },
  { id: 'closer', name: 'Closer', category: 'addon', unit: 'item', unit_price: 10000, is_active: true },
  { id: 'standalone', name: 'A Swing Door', category: 'product', unit: 'item', unit_price: 100000, is_active: true },
];
const openings = ids.slice(0, 3).map((id, index) => ({
  id, project_id: projectId, floor: 'GF', room: 'Bedroom', width: 100 + index * 50, height: 100,
  quantity: index === 1 ? 2 : 1, opening_type: 'Window', opening_direction: 'Sliding',
}));
const choices = openings.map((opening, index) => ({
  openingId: opening.id, systemId: 'system', systemRate: [250000, 300000, 470000][index], glassId: 'glass',
  extras: [{ id: 'closer', quantity: index === 1 ? 2 : 1 }],
}));
const original = () => pricing.priceQuotation(openings, choices, catalog, 'original-author');

function fixture({ role = 'Indoor Sales', stage = 'quotation', signed = false, status = 'quotation_in_progress', excluded = [], additionalState = null, missingFlow = false } = {}) {
  const calls = [], reads = [];
  const project = {
    id: projectId, branch: 'Karkh', building_type: 'commercial_building', project_name: 'Removal fixture',
    project_number: 'PRJ-REMOVE', created_by: 'outdoor', sales_status: status, additional_openings_state: additionalState,
  };
  const snapshot = original();
  if (excluded.length) {
    snapshot.lines = snapshot.lines.filter(line => !excluded.includes(line.opening.id));
    snapshot.excludedOpeningIds = [...excluded];
    snapshot.total = snapshot.lines.reduce((sum, line) => sum + line.total, 0);
  }
  const stored = {
    project_id: projectId, revision: 4, stage, quotation: snapshot,
    contract: stage === 'contract' ? { quotation: structuredClone(snapshot) } : null,
    signed_at: signed ? '2026-11-04T08:00:00Z' : null,
  };
  const tables = { projects: [project], openings: structuredClone(openings), sales_workflows: missingFlow ? [] : [stored], product_price_settings: structuredClone(catalog) };
  const admin = {
    from(table) {
      const filters = [];
      const result = single => {
        const rows = tables[table].filter(row => filters.every(predicate => predicate(row)));
        reads.push({ table, ids: rows.map(row => row.id) });
        return { data: single ? rows[0] ?? null : rows, error: null };
      };
      return {
        select() { return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        order() { return this; }, maybeSingle: async () => result(true),
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
        delete() { throw new Error('Quotation removal must not delete measured rows'); },
        update() { throw new Error('Quotation removal must use the atomic revision transaction'); },
      };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { ...stored, stage: 'quotation', revision: 5, quotation: args.p_payload }, error: null };
    },
  };
  const load = modules({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/auth/adminServer': { requireRole: async roles => roles.includes(role)
      ? { ok: true, role, profile: { branch: 'Karkh' }, user: { id: actorId } }
      : { ok: false, status: 403, error: 'Forbidden' } },
    '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/contracts/uploadedTerms': {},
  });
  const route = load('app/api/sales-flow/[projectId]/route');
  const post = body => route.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ projectId }) });
  return { calls, reads, tables, stored, post };
}

const removal = { action: 'save', revision: 4, excludedOpeningIds: [ids[1]], choices: [choices[0], choices[2]], additionalItems: [] };

test('quotation exclusions accept only unique IDs of current quotable measurements', () => {
  const { normalizeExcludedOpeningIds } = modules()('lib/workflow/quotationOpenings');
  const existing = [...openings, { ...openings[0], id: ids[3], opening_type: 'Facade' }, { ...openings[0], id: ids[4], opening_type: 'Skylight' }];
  assert.deepEqual(normalizeExcludedOpeningIds(existing), []);
  assert.deepEqual(normalizeExcludedOpeningIds(existing, [ids[2], ids[0]]), [ids[2], ids[0]]);
  for (const invalid of [null, {}, '', [null], [ids[0], ids[0]], [ids[3]], [ids[4]], [ids[5]]]) {
    assert.throws(() => normalizeExcludedOpeningIds(existing, invalid));
  }
});

test('Indoor Sales removes a middle opening from the quotation without changing surviving prices or measured rows', async () => {
  const x = fixture();
  const before = structuredClone(x.tables);
  const result = await x.post({ ...removal, total: 1, preparedBy: 'forged' });
  assert.equal(result.status, 200);
  assert.equal(x.calls.length, 1);
  const { name, args } = x.calls[0];
  assert.equal(name, 'advance_sales_flow');
  assert.equal(args.p_actor, actorId);
  assert.equal(args.p_revision, 4);
  assert.deepEqual(args.p_payload.excludedOpeningIds, [ids[1]]);
  assert.deepEqual(args.p_payload.lines, before.sales_workflows[0].quotation.lines.filter(line => line.opening.id !== ids[1]));
  assert.equal(args.p_payload.total, args.p_payload.lines.reduce((sum, line) => sum + line.total, 0));
  assert.deepEqual(x.tables, before, 'Original measurements and saved snapshot must not be mutated by preparing the revision');
});

test('removing the first opening preserves the remaining opening-specific rates and accessory quantities', async () => {
  const x = fixture();
  assert.equal((await x.post({ ...removal, excludedOpeningIds: [ids[0]], choices: choices.slice(1) })).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.lines, original().lines.slice(1));
});

for (const invalid of [null, '', {}, [null], [3], [ids[0], ids[0]], [ids[5]], ['not-an-opening']]) {
  test(`invalid quotation exclusions fail before the save transaction: ${JSON.stringify(invalid)}`, async () => {
    const x = fixture();
    assert.equal((await x.post({ ...removal, excludedOpeningIds: invalid })).status, 400);
    assert.equal(x.calls.length, 0);
  });
}

test('excluded IDs cannot refer to a new unsaved draft opening, facade, or separately priced skylight', async () => {
  for (const row of [
    { ...openings[0], id: ids[3], opening_type: 'Facade', work_area: 'facade', facade_number: 1 },
    { ...openings[0], id: ids[3], opening_type: 'Skylight' },
  ]) {
    const x = fixture();
    x.tables.openings.push(row);
    assert.equal((await x.post({ ...removal, choices, excludedOpeningIds: [row.id] })).status, 400);
    assert.equal(x.calls.length, 0);
  }
  const x = fixture();
  const draft = { id: ids[3], floor: 'GF', room: 'Kitchen', width: 120, height: 100, structuralType: 'Window', openingType: 'Sliding' };
  assert.equal((await x.post({ ...removal, excludedOpeningIds: [draft.id], newOpenings: [draft] })).status, 400);
  assert.equal(x.calls.length, 0);
});

test('a removed opening cannot also be quoted, and retained openings cannot disappear silently', async () => {
  for (const selected of [choices, [choices[0]], [choices[0], choices[0]]]) {
    const x = fixture();
    assert.equal((await x.post({ ...removal, choices: selected })).status, 400);
    assert.equal(x.calls.length, 0);
  }
});

test('removing every opening requires another billable product or facade service', async () => {
  const x = fixture();
  const body = { ...removal, excludedOpeningIds: openings.map(opening => opening.id), choices: [] };
  assert.equal((await x.post(body)).status, 400);
  assert.equal(x.calls.length, 0);
  assert.equal((await x.post({ ...body, additionalItems: [{ id: 'standalone', quantity: 2 }] })).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.lines, []);
  assert.equal(x.calls[0].args.p_payload.total, 200000);
});

test('a new quotation opening can be saved alongside an excluded measured opening', async () => {
  const x = fixture();
  const draft = { id: ids[3], floor: 'GF', room: 'Kitchen', width: 120, height: 100, structuralType: 'Window', openingType: 'Sliding' };
  assert.equal((await x.post({ ...removal, newOpenings: [draft], choices: [...removal.choices, { openingId: draft.id, systemId: 'system', extras: [] }] })).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.lines.map(line => line.opening.id), [ids[0], ids[2], draft.id]);
  assert.deepEqual(x.calls[0].args.p_payload.excludedOpeningIds, [ids[1]]);
});

test('explicitly restoring a removed opening saves it with its own chosen pricing', async () => {
  const x = fixture({ excluded: [ids[1]] });
  assert.equal((await x.post({ ...removal, excludedOpeningIds: [], choices })).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.lines, original().lines);
  assert.deepEqual(x.calls[0].args.p_payload.excludedOpeningIds ?? [], []);
});

test('an older client omitting exclusions keeps the current removal instead of silently restoring the opening', async () => {
  const x = fixture({ excluded: [ids[1]] });
  const { excludedOpeningIds: omitted, ...body } = removal;
  assert.equal(omitted.length, 1);
  assert.equal((await x.post(body)).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.excludedOpeningIds, [ids[1]]);
  assert.deepEqual(x.calls[0].args.p_payload.lines.map(line => line.opening.id), [ids[0], ids[2]]);
});

test('a first quotation can exclude a measured opening without deleting it', async () => {
  const x = fixture({ missingFlow: true, status: 'ready_for_quotation' });
  assert.equal((await x.post({ ...removal, revision: 0 })).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.excludedOpeningIds, [ids[1]]);
  assert.equal(x.tables.openings.length, 3);
});

test('removal retains recorded facade metadata and separately priced skylight information', async () => {
  const x = fixture();
  const facade = { ...openings[0], id: ids[3], opening_type: 'Facade', work_area: 'facade', facade_number: 1 };
  x.tables.openings.push(facade, { ...openings[0], id: ids[4], opening_type: 'Skylight' });
  assert.equal((await x.post(removal)).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.facadeMeasurements, [facade]);
  assert.equal(x.calls[0].args.p_payload.skylightsPricedSeparately, true);
});

for (const role of ['Outdoor Sales', 'HR', 'Operations Manager']) test(`${role} cannot remove a quotation opening`, async () => {
  const x = fixture({ role });
  assert.equal((await x.post(removal)).status, 403);
  assert.equal(x.calls.length, 0);
  assert.equal(x.reads.length, 0);
});

test('stale revisions and signed contracts remain protected from quotation opening removal', async () => {
  const stale = fixture();
  assert.equal((await stale.post({ ...removal, revision: 3 })).status, 409);
  assert.equal(stale.calls.length, 0);
  for (const options of [{ signed: true }, { stage: 'signed', status: 'contract_signed' }, { stage: 'operations', status: 'transferred_to_operations' }]) {
    const x = fixture(options);
    assert.notEqual((await x.post(removal)).status, 200);
    assert.equal(x.calls.length, 0);
  }
});

test('revising an unsigned contract still requires explicit replacement confirmation', async () => {
  const x = fixture({ stage: 'contract', status: 'contract_generated' });
  assert.equal((await x.post(removal)).status, 400);
  assert.equal(x.calls.length, 0);
  assert.equal((await x.post({ ...removal, replaceUnsignedContract: true })).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.excludedOpeningIds, [ids[1]]);
});

test('catalog repricing and discount edits preserve removed openings without mutating older snapshots', () => {
  const snapshot = { ...pricing.priceQuotation(openings.filter(opening => opening.id !== ids[1]), removal.choices, catalog, actorId), excludedOpeningIds: [ids[1]] };
  const before = structuredClone(snapshot);
  const discounted = pricing.applyQuotationDiscount(snapshot, 5);
  assert.deepEqual(discounted.excludedOpeningIds, [ids[1]]);
  assert.deepEqual(discounted.lines.map(line => line.opening.id), [ids[0], ids[2]]);
  const repriced = pricing.repriceQuotation(discounted, catalog.map(product => product.id === 'glass' ? { ...product, unit_price: 35000 } : product), 'new-author');
  assert.deepEqual(repriced.excludedOpeningIds, [ids[1]]);
  assert.deepEqual(repriced.lines.map(line => line.opening.id), [ids[0], ids[2]]);
  assert.equal(repriced.discount.percent, 5);
  assert.deepEqual(snapshot, before);
});

test('price-update and discount API actions keep saved exclusions even when a request tries to restore them', async () => {
  const x = fixture({ excluded: [ids[1]] });
  const before = structuredClone(x.stored);
  const preview = await x.post({ action: 'preview-prices', revision: 4, excludedOpeningIds: [] });
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.quotation.excludedOpeningIds, [ids[1]]);
  assert.equal(x.calls.length, 0);
  assert.equal((await x.post({ action: 'update-prices', revision: 4, priceKey: preview.body.priceKey, confirmed: true, excludedOpeningIds: [] })).status, 200);
  assert.deepEqual(x.calls[0].args.p_payload.excludedOpeningIds, [ids[1]]);
  assert.equal((await x.post({ action: 'set-discount', revision: 4, discountPercent: 5, excludedOpeningIds: [] })).status, 200);
  assert.deepEqual(x.calls[1].args.p_payload.excludedOpeningIds, [ids[1]]);
  assert.deepEqual(x.calls[1].args.p_payload.lines.map(line => line.opening.id), [ids[0], ids[2]]);
  assert.deepEqual(x.stored, before);
});
