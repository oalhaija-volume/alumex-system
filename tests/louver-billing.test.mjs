import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

const rules = load('../src/lib/workflow/catalogRules.ts');
const models = load('../src/lib/workflow/alumexModels.ts', { './catalogRules': rules });
const { priceQuotation, repriceQuotation, measuredOpeningArea, billableOpeningArea, quotationPriceKey } = load('../src/lib/workflow/pricing.ts', {
  './catalogRules': rules, './alumexModels': models,
});
const product = (id, name, category, unit, unit_price) => ({ id, name, category, unit, unit_price, is_active: true });
const catalog = [
  product('louver', 'Louver', 'opening_product', 'sqm', 100_000),
  product('system', 'Alumex System', 'aluminum_system', 'sqm', 100_000),
  product('glass', 'Low-E Glass', 'glass_option', 'sqm', 20_000),
  product('curtain', 'Curtain Wall', 'facade_service', 'sqm', 100_000),
  product('handle', 'Handle', 'addon', 'item', 5_000),
  product('bars', 'Georgian bars', 'addon', 'meter', 2_000),
  product('facade', 'Cladding', 'facade_service', 'sqm', 100_000),
  product('standalone', 'A Swing Door', 'standalone_product', 'item', 2_250_000),
];
const opening = (width = 80, height = 150, quantity = 1, extra = {}) => ({
  id: 'louver-opening', floor: 'Ground', room: 'Plant room', width, height, quantity,
  opening_type: 'Louver', opening_direction: 'Hinged', has_arch: false,
  has_roller_shutter: false, work_area: 'internal', ...extra,
});
const choice = (openingId = 'louver-opening', systemId = 'louver', extra = {}) => ({ openingId, systemId, extras: [], ...extra });
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? 'Area'}: ${actual} != ${expected}`);

for (const [width, height, measured, billed] of [
  [80, 150, 1.2, 1.5],
  [120, 70, 0.84, 1.2],
  [80, 70, 0.56, 1],
  [50, 250, 1.25, 2.5],
  [100, 100, 1, 1],
  [100, 150, 1.5, 1.5],
  [140, 150, 2.1, 2.1],
  [99.5, 150.5, 1.497475, 1.505],
]) test(`louver ${width} × ${height} cm prices ${billed} sqm and retains its measured dimensions`, () => {
  const measuredOpening = opening(width, height), original = structuredClone(measuredOpening);
  const result = priceQuotation([measuredOpening], [choice()], catalog, 'indoor');
  const line = result.lines[0];
  close(measuredOpeningArea(measuredOpening), measured);
  close(billableOpeningArea(measuredOpening), billed);
  close(line.area, measured);
  close(line.system.quantity, billed);
  assert.equal(line.system.unit, 'sqm');
  assert.equal(line.system.rate, 100_000);
  assert.equal(line.system.total, Math.round(billed * 100_000));
  assert.equal(line.total, line.system.total);
  assert.equal(result.total, line.total);
  assert.deepEqual(line.opening, original, 'The quotation must retain every measured opening field');
  assert.deepEqual(measuredOpening, original, 'Pricing must not mutate the input dimensions');
  assert.equal(line.glass, null);
  assert.deepEqual(line.extras, []);
});

test('each repeated louver receives the dimension minimum before the physical quantity is applied', () => {
  const measuredOpening = opening(80, 70, 4);
  const result = priceQuotation([measuredOpening], [choice()], catalog, 'indoor');
  const line = result.lines[0];
  close(line.area, 2.24);
  assert.equal(line.system.quantity, 4);
  assert.equal(line.system.total, 400_000);
  assert.equal(result.total, 400_000);
  assert.equal(line.opening.width, 80);
  assert.equal(line.opening.height, 70);
  assert.equal(line.opening.quantity, 4);
});

for (const name of ['Louver', 'Louvers', 'Louvres', '  LOUVERS  ']) {
  for (const opening_type of ['Window', 'Door']) test(`${name.trim()} selected for a ${opening_type} uses the louver price basis`, () => {
    const products = catalog.map(item => item.id === 'louver' ? { ...item, name } : item);
    const measuredOpening = opening(80, 150, 2, { opening_type });
    const result = priceQuotation([measuredOpening], [choice()], products, 'indoor');
    close(billableOpeningArea(measuredOpening, products[0]), 1.5);
    close(result.lines[0].area, 2.4);
    assert.equal(result.lines[0].system.quantity, 3);
    assert.equal(result.total, 300_000);
    assert.deepEqual(result.lines[0].opening, measuredOpening);
  });
}

for (const unit of ['item', 'meter']) test(`non-sqm louver charges retain their ${unit} quantity`, () => {
  const products = catalog.map(item => item.id === 'louver' ? { ...item, unit } : item);
  const saved = priceQuotation([opening(80, 70, 3)], [choice()], products, 'indoor');
  assert.equal(saved.lines[0].system.quantity, 3);
  assert.equal(saved.total, 300_000);
  const refreshed = repriceQuotation(saved, products.map(item => ({ ...item, unit_price: item.unit_price * 2 })), 'refresher');
  assert.equal(refreshed.lines[0].system.quantity, 3);
  assert.equal(refreshed.total, 600_000);
});

test('other opening types, facade measurements and standalone quantities retain their existing pricing rules', () => {
  const openings = [
    opening(80, 150, 1, { id: 'window', opening_type: 'Window', opening_direction: 'Sliding' }),
    opening(80, 150, 1, { id: 'door', opening_type: 'Door' }),
    opening(80, 150, 1, { id: 'curtain', opening_type: 'Curtain Wall' }),
  ];
  const result = priceQuotation(openings, [
    choice('window', 'system', { glassId: 'glass', extras: [{ id: 'handle', quantity: 2 }, { id: 'bars', quantity: 1.5 }] }),
    choice('door', 'system'), choice('curtain', 'curtain'),
  ], catalog, 'indoor', [
    { id: 'facade', quantity: 1, measurements: [{ label: 'Narrow facade', width: 0.8, height: 1.5, quantity: 2 }] },
    { id: 'standalone', quantity: 4 },
  ]);
  for (const line of result.lines) close(line.system.quantity, 1.2);
  close(result.lines[0].glass.quantity, 1.2);
  assert.equal(result.lines[0].extras[0].quantity, 2);
  assert.equal(result.lines[0].extras[1].quantity, 1.5);
  close(result.additionalItems[0].quantity, 2.4);
  assert.equal(result.additionalItems[1].quantity, 4);
  const smallWindow = opening(80, 70, 1, { opening_type: 'Window' });
  assert.equal(billableOpeningArea(smallWindow), 1, 'The existing per-window area minimum remains intact');
  const smallDoor = opening(80, 70, 1, { opening_type: 'Door' });
  close(billableOpeningArea(smallDoor), 0.56, 'An ordinary door keeps its actual area');
});

test('explicit price refresh corrects a legacy louver basis once and preserves actual measurements and other charges', () => {
  const saved = priceQuotation([opening(80, 150, 3)], [choice()], catalog, 'original', [{ id: 'standalone', quantity: 2 }]);
  saved.version = 4;
  saved.branch = 'Rasafa';
  saved.lines[0].system.name = 'Saved louver specification';
  saved.lines[0].system.quantity = 3.6;
  saved.lines[0].system.total = 360_000;
  saved.lines[0].total = 360_000;
  saved.total = 4_860_000;
  const before = structuredClone(saved);
  const products = catalog.map(item => item.id === 'louver' ? { ...item, unit_price: 125_000 } : item);
  const refreshed = repriceQuotation(saved, products, 'refresher');
  close(refreshed.lines[0].area, 3.6);
  assert.equal(refreshed.lines[0].system.quantity, 4.5);
  assert.equal(refreshed.lines[0].system.rate, 125_000);
  assert.equal(refreshed.lines[0].system.total, 562_500);
  assert.equal(refreshed.total, 5_062_500);
  assert.equal(refreshed.lines[0].system.name, 'Saved louver specification');
  assert.deepEqual(refreshed.lines[0].opening, saved.lines[0].opening);
  assert.deepEqual(refreshed.additionalItems, saved.additionalItems);
  assert.equal(refreshed.branch, 'Rasafa');
  assert.equal(refreshed.version, 4, 'Saving through the workflow assigns the revision version');
  assert.equal(refreshed.preparedBy, 'refresher');
  assert.deepEqual(saved, before, 'A preview must not change the saved quotation');
  const again = repriceQuotation(refreshed, products, 'another-refresher');
  assert.deepEqual(again.lines, refreshed.lines, 'The repeated-opening count must not be multiplied twice');
  assert.deepEqual(again.additionalItems, refreshed.additionalItems);
  assert.equal(again.total, refreshed.total);
  assert.equal(quotationPriceKey(again), quotationPriceKey(refreshed));
  assert.notEqual(quotationPriceKey(refreshed), quotationPriceKey(saved), 'A new billable quantity participates in preview confirmation');
});

test('legacy louver selected for a Door refreshes its billable quantity from catalog identity', () => {
  const saved = priceQuotation([opening(120, 70, 2, { opening_type: 'Door' })], [choice()], catalog, 'original');
  saved.lines[0].system.name = 'Historical product label';
  saved.lines[0].system.quantity = 1.68;
  saved.lines[0].system.total = 168_000;
  saved.lines[0].total = 168_000;
  saved.total = 168_000;
  const refreshed = repriceQuotation(saved, catalog, 'refresher');
  assert.equal(refreshed.lines[0].system.quantity, 2.4);
  assert.equal(refreshed.total, 240_000);
  close(refreshed.lines[0].area, 1.68);
  assert.deepEqual(refreshed.lines[0].opening, saved.lines[0].opening);
});

test('louver minimum pricing and saved percentage discounts use the corrected subtotal without stacking', () => {
  const saved = priceQuotation([opening(80, 70, 3)], [choice()], catalog, 'indoor', [], 5);
  assert.deepEqual(saved.discount, { percent: 5, subtotal: 300_000, amount: 15_000 });
  assert.equal(saved.total, 285_000);
  const products = catalog.map(item => ({ ...item, unit_price: item.unit_price * 2 }));
  const refreshed = repriceQuotation(saved, products, 'refresher');
  assert.equal(refreshed.lines[0].system.quantity, 3);
  assert.deepEqual(refreshed.discount, { percent: 5, subtotal: 600_000, amount: 30_000 });
  assert.equal(refreshed.total, 570_000);
  const repeated = repriceQuotation(refreshed, products, 'refresher');
  assert.deepEqual(repeated.discount, refreshed.discount);
  assert.equal(repeated.total, refreshed.total);
});
