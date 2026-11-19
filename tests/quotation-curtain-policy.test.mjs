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
   return load(name.startsWith('@/') ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url) : new URL(`${name}.ts`, url));
  }, exports);
  return exports;
 }
 return path => load(new URL(`../src/${path}.ts`, import.meta.url));
}

const load = modules();
const { priceQuotation, repriceQuotation, normalizeQuotationPricingPolicy, quotationCurtainMinimumRate } = load('lib/workflow/pricing');
const { applyOpeningSizeChanges, priceQuotationWithSizeChanges } = load('lib/workflow/openingSizeChanges');
const { quotationRateGroups, applyQuotationGroupRate } = load('lib/quotations/groupRates');
const openingId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const wall = { id: openingId, project_id: projectId, floor: 'Ground', room: 'Office', opening_type: 'Curtain Wall', opening_direction: null, width: 300, height: 200, quantity: 2 };
const choice = { openingId, systemId: 'curtain', systemRate: 210000, extras: [] };
const service = { id: 'curtain', quantity: 1, unitRate: 210000, measurements: [{ label: 'North', width: 3, height: 4, quantity: 1 }], extras: [] };
const policy = { curtainWallMinimumRate: 210000 };
const catalog = [
 { id: 'curtain', name: 'Curtain Wall', category: 'facade_service', unit: 'sqm', unit_price: 250000, is_active: true },
 { id: 'alumex', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
];

test('an approved saved policy permits 210,000 only on Curtain Wall openings and services', () => {
 const snapshot = priceQuotation([wall], [choice], catalog, actorId, [service], 0, policy);
 assert.equal(snapshot.lines[0].system.rate, 210000);
 assert.equal(snapshot.lines[0].system.total, 2520000);
 assert.equal(snapshot.additionalItems[0].rate, 210000);
 assert.equal(snapshot.additionalItems[0].total, 2520000);
 assert.equal(snapshot.total, 5040000);
 assert.deepEqual(snapshot.pricingPolicy, policy);
 assert.throws(() => priceQuotation([wall], [choice], catalog, actorId), /240,000/);
 assert.throws(() => priceQuotation([], [], catalog, actorId, [service]), /240,000/);
 assert.throws(() => priceQuotation([wall], [{ ...choice, systemRate: 209999 }], catalog, actorId, [], 0, policy), /210,000/);
 const window = { ...wall, opening_type: 'Window', opening_direction: 'Sliding' };
 assert.throws(() => priceQuotation([window], [{ ...choice, systemId: 'alumex' }], catalog, actorId, [], 0, policy), /240,000/);
});

test('normal quotations keep the original minimum and no policy metadata', () => {
 const normal = priceQuotation([wall], [{ ...choice, systemRate: 240000 }], catalog, actorId);
 assert.equal(Object.hasOwn(normal, 'pricingPolicy'), false);
 assert.equal(quotationCurtainMinimumRate(), 240000);
 assert.equal(quotationCurtainMinimumRate(policy), 210000);
 assert.deepEqual(normalizeQuotationPricingPolicy({ ...policy, forgedExtra: true }), policy);
});

for (const invalid of [null, false, 210000, [], {}, { curtainWallMinimumRate: 0 }, { curtainWallMinimumRate: -1 }, { curtainWallMinimumRate: 210000.5 }, { curtainWallMinimumRate: '210000' }, { curtainWallMinimumRate: 240001 }, { curtainWallMinimumRate: Infinity }, { curtainWallMinimumRate: NaN }]) {
 test(`invalid stored pricing policy is rejected: ${JSON.stringify(invalid)}`, () => {
  assert.throws(() => normalizeQuotationPricingPolicy(invalid), /authorization is invalid/);
  assert.throws(() => priceQuotation([wall], [{ ...choice, systemRate: 240000 }], catalog, actorId, [], 0, invalid), /authorization is invalid/);
 });
}

test('catalog repricing preserves an approved special rate and its policy without mutating history', () => {
 const saved = priceQuotation([wall], [choice], catalog, actorId, [service], 0, policy);
 const before = structuredClone(saved);
 const repriced = repriceQuotation(saved, catalog.map(product => ({ ...product, unit_price: 900000 })), 'new-actor');
 assert.equal(repriced.lines[0].system.rate, 210000);
 assert.equal(repriced.additionalItems[0].rate, 210000);
 assert.equal(repriced.total, 5040000);
 assert.deepEqual(repriced.pricingPolicy, policy);
 assert.deepEqual(saved, before);
});

test('size revisions retain the trusted policy and resize the approved special rate', () => {
 const saved = priceQuotation([wall], [choice], catalog, actorId, [], 0, policy);
 const changes = [{ openingId, previousWidth: 300, previousHeight: 200, previousQuantity: 2, width: 310, height: 200, quantity: 2, reason: 'Site correction' }];
 const resized = applyOpeningSizeChanges([wall], changes);
 const revised = priceQuotationWithSizeChanges(resized, [choice], catalog, actorId, [], 0, saved, changes);
 assert.deepEqual(revised.pricingPolicy, policy);
 assert.equal(revised.lines[0].system.rate, 210000);
 assert.equal(revised.total, 2604000);
 assert.equal(saved.lines[0].opening.width, 300);
});

test('group validation lowers only the authorized Curtain Wall group minimum', () => {
 const window = { ...wall, id: 'window', opening_type: 'Window', opening_direction: 'Sliding' };
 const choices = [choice, { openingId: 'window', systemId: 'alumex', extras: [] }];
 const groups = quotationRateGroups([wall, window], choices, [service], catalog, policy);
 assert.deepEqual(groups.map(group => group.minimum), [240000, 240000, 210000]);
 const applied = applyQuotationGroupRate('curtain-wall', 210000, [wall, window], choices, [service], catalog, policy);
 assert.equal(applied.choices[0].systemRate, 210000);
 assert.equal(applied.additionalItems[0].unitRate, 210000);
 assert.deepEqual(applied.choices[1], choices[1]);
 assert.throws(() => applyQuotationGroupRate('sliding', 210000, [wall, window], choices, [service], catalog, policy), /240,000/);
 assert.throws(() => applyQuotationGroupRate('curtain-wall', 210000, [wall, window], choices, [service], catalog), /240,000/);
});

function routeFixture(savedPolicy) {
 const calls = [];
 const project = { id: projectId, client_id: 'client', branch: 'Karkh', building_type: 'commercial_building', created_by: actorId, sales_status: 'quotation_in_progress' };
 const snapshot = priceQuotation([wall], [{ ...choice, systemRate: 250000 }], catalog, actorId);
 if (savedPolicy !== undefined) snapshot.pricingPolicy = savedPolicy;
 const stored = { project_id: projectId, revision: 4, stage: 'quotation', quotation: snapshot, contract: null, signed_at: null, evidence: null };
 const tables = { projects: [project], openings: [wall], sales_workflows: [stored], product_price_settings: catalog };
 const admin = {
  from(table) {
   const filters = [];
   const result = single => {
    const rows = tables[table].filter(row => filters.every(predicate => predicate(row)));
    return { data: single ? rows[0] ?? null : rows, error: null };
   };
   return { select() { return this; }, eq(key, value) { filters.push(row => row[key] === value); return this; }, order() { return this; }, maybeSingle: async () => result(true), then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); } };
  },
  async rpc(name, args) { calls.push({ name, args }); return { data: { ...stored, quotation: args.p_payload }, error: null }; },
 };
 const route = modules({
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
  '@/lib/auth/adminServer': { requireRole: async () => ({ ok: true, role: 'Indoor Sales', profile: { branch: 'Karkh' }, user: { id: actorId } }) },
  '@/lib/supabase/config': { hasSupabaseServiceRoleKey: () => true },
  '@/lib/supabase/admin': { createAdminClient: () => admin },
  '@/lib/contracts/uploadedTerms': {},
 })('app/api/sales-flow/[projectId]/route');
 return { calls, post: body => route.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ projectId }) }) };
}
const save = { action: 'save', revision: 4, choices: [choice], newOpenings: [], additionalItems: [] };

test('quotation save accepts only the policy from the existing server snapshot', async () => {
 const authorized = routeFixture(policy);
 const result = await authorized.post({ ...save, pricingPolicy: { curtainWallMinimumRate: 1 } });
 assert.equal(result.status, 200);
 assert.deepEqual(authorized.calls[0].args.p_payload.pricingPolicy, policy);
 assert.equal(authorized.calls[0].args.p_payload.lines[0].system.rate, 210000);
 const lowered = routeFixture(policy);
 assert.equal((await lowered.post({ ...save, pricingPolicy: { curtainWallMinimumRate: 1 }, choices: [{ ...choice, systemRate: 1 }] })).status, 400);
 assert.equal(lowered.calls.length, 0);
});

test('a client cannot introduce a pricing exception on another quotation', async () => {
 const unauthorized = routeFixture();
 assert.equal((await unauthorized.post({ ...save, pricingPolicy: policy, quotation: { pricingPolicy: policy } })).status, 400);
 assert.equal(unauthorized.calls.length, 0);
 const normal = routeFixture();
 assert.equal((await normal.post({ ...save, pricingPolicy: policy, choices: [{ ...choice, systemRate: 240000 }] })).status, 200);
 assert.equal(Object.hasOwn(normal.calls[0].args.p_payload, 'pricingPolicy'), false);
});
