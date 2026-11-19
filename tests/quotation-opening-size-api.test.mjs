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

const { priceQuotation } = modules()('lib/workflow/pricing');
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sourceId = '11111111-1111-4111-8111-111111111111';
const splitId = '22222222-2222-4222-8222-222222222222';
const opening = { id: sourceId, project_id: projectId, floor: 'First', room: 'Office', width: 120, height: 150, quantity: 4, opening_type: 'Window', opening_direction: 'Sliding', has_roller_shutter: false };
const catalog = [
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'glass', name: 'Double Glass', category: 'glass_option', unit: 'sqm', unit_price: 15000, is_active: true },
];
const choice = { openingId: sourceId, systemId: 'system', systemRate: 300000, glassId: 'glass', extras: [] };
const change = { openingId: sourceId, previousWidth: 120, previousHeight: 150, previousQuantity: 4, width: 130, height: 160, quantity: 4, reason: 'Corrected against the site drawing' };
const request = { action: 'save', revision: 4, choices: [choice], openingSizeChanges: [change], newOpenings: [], additionalItems: [] };

function fixture({ role = 'Indoor Sales', stage = 'quotation', signed = false, status = 'quotation_in_progress', additionalState = null, missingFlow = false, evidence = null, acceptedAt = null } = {}) {
  const calls = [], reads = [];
  const project = { id: projectId, client_id: 'client', branch: 'Karkh', building_type: 'commercial_building', project_name: 'Size fixture', project_number: 'PRJ-SIZE', created_by: 'outdoor', sales_status: status, additional_openings_state: additionalState };
  const snapshot = { ...priceQuotation([opening], [choice], catalog, 'original-author'), version: 3 };
  const stored = { project_id: projectId, revision: 4, stage, quotation: snapshot, contract: stage === 'contract' ? { quotation: structuredClone(snapshot) } : null, signed_at: signed ? '2026-11-19T08:00:00Z' : null, evidence, accepted_at: acceptedAt };
  const tables = { projects: [project], openings: [structuredClone(opening)], sales_workflows: missingFlow ? [] : [stored], product_price_settings: structuredClone(catalog) };
  const admin = {
    from(table) {
      const filters = [];
      const result = single => {
        const rows = tables[table].filter(row => filters.every(predicate => predicate(row)));
        reads.push(table);
        return { data: single ? rows[0] ?? null : rows, error: null };
      };
      return {
        select() { return this; }, eq(key, value) { filters.push(row => row[key] === value); return this; }, order() { return this; },
        maybeSingle: async () => result(true), then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
        update() { throw new Error('Opening sizes must be saved in the atomic revision transaction'); },
        insert() { throw new Error('Size splits must be saved in the atomic revision transaction'); },
        delete() { throw new Error('Size editing must never delete opening measurements'); },
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
  const post = body => route.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ projectId }) });
  return { calls, reads, tables, stored, post };
}

test('Indoor Sales saves revised dimensions, trusted pricing and an audit reason in one dedicated transaction', async () => {
  const x = fixture(), before = structuredClone(x.tables);
  x.tables.product_price_settings[1].unit_price = 90000;
  const result = await x.post({ ...request, total: 1, preparedBy: 'forged-author', changed_by: 'forged-employee', lines: [{ opening: { width: 999 } }] });
  assert.equal(result.status, 200);
  assert.equal(x.calls.length, 1);
  const { name, args } = x.calls[0];
  assert.equal(name, 'save_quotation_with_opening_sizes');
  assert.equal(args.p_actor, actorId); assert.equal(args.p_project, projectId); assert.equal(args.p_revision, 4);
  assert.deepEqual(args.p_payload.openingSizeChanges, [change]);
  assert.equal(args.p_payload.preparedBy, actorId);
  assert.deepEqual(args.p_payload.lines[0].opening, { ...opening, width: 130, height: 160 });
  assert.equal(args.p_payload.lines[0].system.rate, 300000);
  assert.equal(args.p_payload.lines[0].glass.rate, 15000, 'A size correction retains saved glass rates despite catalog changes');
  assert.equal(args.p_payload.total, 2620800);
  assert.deepEqual(x.tables.openings, before.openings); assert.deepEqual(x.stored, before.sales_workflows[0]);
});

test('a size split keeps the untouched copies and quotes the resized copies separately with cloned selections', async () => {
  const x = fixture();
  const split = { ...change, quantity: 1, splitOpeningId: splitId };
  const result = await x.post({ ...request, openingSizeChanges: [split], choices: [choice, { ...choice, openingId: splitId }] });
  assert.equal(result.status, 200);
  const lines = x.calls[0].args.p_payload.lines;
  assert.deepEqual(lines.map(line => ({ id: line.opening.id, width: line.opening.width, height: line.opening.height, quantity: line.opening.quantity })), [
    { id: sourceId, width: 120, height: 150, quantity: 3 },
    { id: splitId, width: 130, height: 160, quantity: 1 },
  ]);
  assert.equal(lines[0].system.rate, lines[1].system.rate);
  assert.equal(lines[0].glass.rate, lines[1].glass.rate);
});

test('saving without size edits continues through the existing workflow RPC', async () => {
  for (const openingSizeChanges of [undefined, []]) {
    const x = fixture();
    assert.equal((await x.post({ ...request, openingSizeChanges })).status, 200);
    assert.equal(x.calls[0].name, 'advance_sales_flow');
    assert.equal(x.calls[0].args.p_action, 'save');
    assert.equal(Object.hasOwn(x.calls[0].args.p_payload, 'openingSizeChanges'), false);
  }
});

for (const patch of [{ reason: '' }, { width: 0 }, { width: 100001 }, { height: 1.001 }, { previousWidth: 100 }, { previousQuantity: 3 }, { quantity: 1 }, { openingId: splitId }]) {
  test(`invalid or stale size edit fails before a database write: ${Object.keys(patch)[0]}`, async () => {
    const x = fixture();
    assert.notEqual((await x.post({ ...request, openingSizeChanges: [{ ...change, ...patch }] })).status, 200);
    assert.equal(x.calls.length, 0);
  });
}

test('a split cannot collide with a newly added opening or omit the untouched copies from pricing', async () => {
  const split = { ...change, quantity: 1, splitOpeningId: splitId };
  const x = fixture();
  const draft = { id: splitId, floor: 'First', room: 'Office', width: 130, height: 160, quantity: 1, structuralType: 'Window', openingType: 'Sliding', hasArch: false };
  assert.notEqual((await x.post({ ...request, openingSizeChanges: [split], newOpenings: [draft], choices: [choice, { ...choice, openingId: splitId }] })).status, 200);
  assert.equal(x.calls.length, 0);
  assert.notEqual((await x.post({ ...request, openingSizeChanges: [split], choices: [{ ...choice, openingId: splitId }] })).status, 200);
  assert.equal(x.calls.length, 0);
});

test('an excluded opening must be restored before changing its size', async () => {
  const x = fixture();
  assert.notEqual((await x.post({ ...request, excludedOpeningIds: [sourceId], choices: [] })).status, 200);
  assert.equal(x.calls.length, 0);
});

for (const action of ['approve', 'preview-prices', 'update-prices', 'contract', 'sign', 'save-contract-details']) {
  test(`${action} cannot carry an opening-size mutation`, async () => {
    const x = fixture();
    assert.notEqual((await x.post({ ...request, action, confirmed: true })).status, 200);
    assert.equal(x.calls.length, 0);
  });
}

for (const role of ['Outdoor Sales', 'Operations Manager', 'HR']) test(`${role} cannot change quotation opening sizes`, async () => {
  const x = fixture({ role });
  assert.equal((await x.post(request)).status, 403);
  assert.equal(x.calls.length, 0);
});

test('stale revisions, signed evidence and Operations transfer lock size editing', async () => {
  const stale = fixture();
  assert.equal((await stale.post({ ...request, revision: 3 })).status, 409);
  assert.equal(stale.calls.length, 0);
  for (const options of [{ signed: true }, { stage: 'contract', status: 'contract_signed' }, { stage: 'operations', status: 'transferred_to_operations' }, { evidence: { method: 'hard_copy' } }, { acceptedAt: '2026-11-19T08:00:00Z' }]) {
    const x = fixture(options);
    assert.notEqual((await x.post({ ...request, replaceUnsignedContract: true })).status, 200);
    assert.equal(x.calls.length, 0);
  }
});

test('closed projects and pending additional measurements cannot receive size revisions', async () => {
  for (const options of [{ status: 'closed' }, { status: 'lost' }, { status: 'cancelled' }, { additionalState: 'requested' }, { additionalState: 'submitted' }]) {
    const x = fixture(options);
    assert.equal((await x.post(request)).status, 409);
    assert.equal(x.calls.length, 0);
  }
});

test('an unsigned contract requires replacement confirmation before a size revision', async () => {
  const x = fixture({ stage: 'contract', status: 'contract_generated' });
  assert.notEqual((await x.post(request)).status, 200);
  assert.equal(x.calls.length, 0);
  assert.equal((await x.post({ ...request, replaceUnsignedContract: true })).status, 200);
  assert.equal(x.calls[0].name, 'save_quotation_with_opening_sizes');
  assert.equal(x.calls[0].args.p_payload.replaceUnsignedContract, true);
});

test('a first quotation can save a corrected size through the same audited transaction', async () => {
  const x = fixture({ missingFlow: true, status: 'ready_for_quotation' });
  assert.equal((await x.post({ ...request, revision: 0 })).status, 200);
  assert.equal(x.calls[0].name, 'save_quotation_with_opening_sizes');
  assert.deepEqual(x.calls[0].args.p_payload.openingSizeChanges, [change]);
});
