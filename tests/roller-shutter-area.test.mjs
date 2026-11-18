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
const { priceQuotation, repriceQuotation, quotationPriceKey, isRollerShutterMotor } = load('../src/lib/workflow/pricing.ts', {
  './catalogRules': rules, './alumexModels': models,
});
const catalog = [
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 240_000, is_active: true },
  { id: 'shutter', name: 'Roller Shutter - Foam', category: 'addon', unit: 'sqm', unit_price: 30_000, is_active: true },
  { id: 'bars', name: 'Georgian bars', category: 'addon', unit: 'meter', unit_price: 5_000, is_active: true },
  { id: 'box', name: 'Roller Shutter Box', category: 'addon', unit: 'item', unit_price: 20_000, is_active: true },
];
const opening = (width, height, quantity = 1, opening_type = 'Window') => ({
  id: 'opening', floor: 'GF', room: 'Office', width, height, quantity, opening_type,
  opening_direction: 'Sliding', has_roller_shutter: true,
});
const selection = { openingId: 'opening', systemId: 'system', extras: [{ id: 'shutter', quantity: 999, motorPrice: 35_000 }] };
const quote = (measured, choice = selection, products = catalog) => priceQuotation([measured], [choice], products, 'indoor');
const shutter = snapshot => snapshot.lines[0].extras.find(charge => charge.id === 'shutter');
const motor = snapshot => snapshot.lines[0].extras.find(isRollerShutterMotor);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

for (const [width, height, quantity, expectedArea] of [
  [50, 100, 1, 0.5],
  [80, 70, 1, 0.56],
  [80, 150, 2, 2.4],
  [120, 70, 3, 2.52],
  [100, 100, 4, 4],
  [200, 250, 2, 10],
  [99.5, 150.5, 2, 2.99495],
]) test(`shutter ${width} × ${height} cm × ${quantity} uses ${expectedArea} sqm with ${quantity} motors`, () => {
  const measured = opening(width, height, quantity), before = structuredClone(measured);
  const result = quote(measured);
  assert.equal(shutter(result).unit, 'sqm');
  close(shutter(result).quantity, expectedArea);
  assert.equal(shutter(result).total, Math.round(expectedArea * 30_000));
  assert.equal(motor(result).unit, 'item');
  assert.equal(motor(result).quantity, quantity);
  assert.equal(motor(result).rate, 35_000);
  assert.equal(motor(result).total, quantity * 35_000);
  close(result.lines[0].area, expectedArea);
  assert.deepEqual(result.lines[0].opening, before);
  assert.deepEqual(measured, before);
});

test('shutter sqm follows actual dimensions independently of the window pricing minimum', () => {
  const result = quote(opening(80, 70, 3));
  assert.equal(result.lines[0].system.quantity, 3, 'The existing one sqm system minimum remains per window');
  close(shutter(result).quantity, 1.68, 'The shutter must use 0.56 sqm per physical opening');
  assert.equal(shutter(result).total, 50_400);
  assert.equal(motor(result).total, 105_000);
  assert.equal(result.total, 875_400);
});

test('door shutters use the same original dimensions and keep length and item add-ons independent', () => {
  const measured = opening(80, 150, 2, 'Door');
  const choice = { ...selection, extras: [...selection.extras, { id: 'box', quantity: 1 }, { id: 'bars', quantity: 1.5 }] };
  const result = quote(measured, choice);
  close(result.lines[0].system.quantity, 2.4);
  close(shutter(result).quantity, 2.4);
  assert.equal(motor(result).quantity, 2);
  assert.equal(result.lines[0].extras.find(charge => charge.id === 'box').quantity, 2);
  assert.equal(result.lines[0].extras.find(charge => charge.id === 'bars').quantity, 3);
  assert.equal(result.total, 773_000);
  assert.deepEqual(result.lines[0].opening, measured);
});

test('saved sqm shutter refresh derives its area from measurements once, retaining the manual motor price', () => {
  const saved = quote(opening(80, 150, 3));
  // A historical sqm quote may have inherited the system window minimum or
  // another saved basis. An explicit refresh uses the opening's real area.
  shutter(saved).quantity = 4.5;
  shutter(saved).total = 135_000;
  saved.lines[0].total = saved.lines[0].system.total + 135_000 + motor(saved).total;
  saved.total = saved.lines[0].total;
  const before = structuredClone(saved);
  const products = catalog.map(product => product.id === 'shutter' ? { ...product, unit_price: 50_000 } : product);
  const refreshed = repriceQuotation(saved, products, 'refresher');
  close(shutter(refreshed).quantity, 3.6);
  assert.equal(shutter(refreshed).rate, 50_000);
  assert.equal(shutter(refreshed).total, 180_000);
  assert.deepEqual(motor(refreshed), motor(saved));
  assert.deepEqual(refreshed.lines[0].opening, saved.lines[0].opening);
  assert.equal(refreshed.lines[0].area, saved.lines[0].area);
  assert.deepEqual(saved, before, 'Refreshing must not mutate a saved quote or its measurements');
  const twice = repriceQuotation(refreshed, products, 'refresher-again');
  assert.deepEqual(twice.lines, refreshed.lines, 'Refreshing again must not apply physical quantity twice');
  assert.equal(twice.total, refreshed.total);
  assert.equal(quotationPriceKey(twice), quotationPriceKey(refreshed));
  assert.notEqual(quotationPriceKey(refreshed), quotationPriceKey(saved));
});

test('a legacy item-priced shutter cannot be silently reinterpreted as a square-metre rate', () => {
  const legacy = quote(opening(50, 100, 3));
  Object.assign(shutter(legacy), { unit: 'item', quantity: 3, total: 90_000 });
  legacy.lines[0].total = 915_000;
  legacy.total = 915_000;
  const before = structuredClone(legacy);
  assert.throws(() => repriceQuotation(legacy, catalog, 'refresher'), /catalog unit changed.*Edit quotation/);
  assert.deepEqual(legacy, before);
  const edited = quote(legacy.lines[0].opening);
  assert.equal(shutter(edited).unit, 'sqm');
  assert.equal(shutter(edited).quantity, 1.5);
  assert.deepEqual(motor(edited), motor(legacy));
});
