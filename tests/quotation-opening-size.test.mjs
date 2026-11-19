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

const load = modules();
const { normalizeOpeningSizeChanges, applyOpeningSizeChanges, priceQuotationWithSizeChanges } = load('lib/workflow/openingSizeChanges');
const { priceQuotation } = load('lib/workflow/pricing');
const sourceId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const splitId = '33333333-3333-4333-8333-333333333333';
const opening = {
  id: sourceId, floor: 'First', room: 'Office', width: 120, height: 150, quantity: 4,
  opening_type: 'Window', opening_direction: 'Sliding', has_arch: true,
  has_roller_shutter: true, work_area: 'internal', facade_number: null,
};
const other = { ...opening, id: otherId, floor: 'Ground', room: 'Kitchen', quantity: 1 };
const change = {
  openingId: sourceId, previousWidth: 120, previousHeight: 150, previousQuantity: 4,
  width: 130, height: 160, quantity: 4, reason: 'Corrected against the site drawing',
};

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('size changes are optional and normalize a trimmed reason without mutating the request', () => {
  assert.deepEqual(normalizeOpeningSizeChanges([opening], undefined), []);
  assert.deepEqual(normalizeOpeningSizeChanges([opening], []), []);
  const request = freeze([{ ...change, width: 130.25, height: 160.01, reason: '  Corrected against the site drawing  ' }]);
  assert.deepEqual(normalizeOpeningSizeChanges([opening], request), [{ ...change, width: 130.25, height: 160.01 }]);
  assert.equal(request[0].reason, '  Corrected against the site drawing  ');
});

test('resizing all identical openings retains their identity, metadata and quantity', () => {
  const originals = freeze([structuredClone(opening), structuredClone(other)]);
  const before = structuredClone(originals);
  const edits = normalizeOpeningSizeChanges(originals, [change]);
  const resized = applyOpeningSizeChanges(originals, edits);
  assert.deepEqual(resized, [{ ...opening, width: 130, height: 160 }, other]);
  assert.deepEqual(originals, before, 'Preparing a revision cannot overwrite its measured baseline');
});

test('resizing one copy creates a separate entry and preserves the untouched copies and their metadata', () => {
  const originals = freeze([structuredClone(opening), structuredClone(other)]);
  const edits = normalizeOpeningSizeChanges(originals, [{ ...change, quantity: 1, splitOpeningId: splitId }]);
  const resized = applyOpeningSizeChanges(originals, edits);
  assert.equal(resized.length, 3);
  assert.deepEqual(resized.find(row => row.id === sourceId), { ...opening, quantity: 3 });
  assert.deepEqual(resized.find(row => row.id === splitId), { ...opening, id: splitId, width: 130, height: 160, quantity: 1 });
  assert.deepEqual(resized.find(row => row.id === otherId), other);
  assert.equal(resized.reduce((count, row) => count + row.quantity, 0), 5, 'Splitting must conserve physical opening quantities');
  assert.deepEqual(originals, [opening, other]);
});

test('a legacy opening without explicit quantity is treated as a single opening', () => {
  const { quantity: omitted, ...legacy } = other;
  assert.equal(omitted, 1);
  const edits = normalizeOpeningSizeChanges([legacy], [{ ...change, openingId: otherId, previousQuantity: 1, quantity: 1 }]);
  const [resized] = applyOpeningSizeChanges([legacy], edits);
  assert.equal(resized.width, 130);
  assert.equal(resized.height, 160);
  assert.equal(resized.quantity ?? 1, 1);
});

for (const key of ['width', 'height']) {
  for (const invalid of [undefined, null, '', '130', false, 0, -1, 0.001, 100000.01, Number.NaN, Number.POSITIVE_INFINITY, 130.123]) {
    test(`size editing rejects invalid ${key}: ${String(invalid)}`, () => {
      assert.throws(() => normalizeOpeningSizeChanges([opening], [{ ...change, [key]: invalid }]));
    });
  }
  test(`size editing accepts the supported ${key} boundaries`, () => {
    for (const value of [0.01, 0.29, 100000]) {
      assert.equal(normalizeOpeningSizeChanges([opening], [{ ...change, [key]: value }])[0][key], value);
    }
  });
}

for (const reason of [undefined, null, '', ' \n\t ', false, 1, {}, 'x'.repeat(501)]) {
  test(`size editing rejects missing, invalid or overly long reasons: ${typeof reason}`, () => {
    assert.throws(() => normalizeOpeningSizeChanges([opening], [{ ...change, reason }]));
  });
}

test('size editing accepts a 500-character reason', () => {
  assert.equal(normalizeOpeningSizeChanges([opening], [{ ...change, reason: 'x'.repeat(500) }])[0].reason.length, 500);
});

for (const patch of [{ previousWidth: 119 }, { previousHeight: 151 }, { previousQuantity: 3 }]) {
  test(`a changed measurement baseline requires reloading: ${Object.keys(patch)[0]}`, () => {
    assert.throws(() => normalizeOpeningSizeChanges([opening], [{ ...change, ...patch }]));
  });
}

test('an edit must target a unique current opening and cannot resize a separately priced capture', () => {
  for (const input of [null, {}, '', [null], [1], [{ ...change, openingId: otherId }], [change, change]]) {
    assert.throws(() => normalizeOpeningSizeChanges([opening], input));
  }
  for (const opening_type of ['Facade', 'Skylight']) {
    assert.throws(() => normalizeOpeningSizeChanges([{ ...opening, opening_type }], [change]));
  }
});

for (const quantity of [undefined, null, '', '1', false, 0, -1, 0.5, 5, 10001]) {
  test(`the affected quantity must be a whole number within the source entry: ${String(quantity)}`, () => {
    assert.throws(() => normalizeOpeningSizeChanges([opening], [{ ...change, quantity, splitOpeningId: splitId }]));
  });
}

test('a partial resize requires a new unique UUID and never reuses another existing opening', () => {
  for (const splitOpeningId of [undefined, null, '', 'new-opening', sourceId, otherId]) {
    assert.throws(() => normalizeOpeningSizeChanges([opening, other], [{ ...change, quantity: 1, splitOpeningId }]));
  }
  const second = { ...change, openingId: otherId, previousQuantity: 2, quantity: 1, splitOpeningId: splitId };
  assert.throws(() => normalizeOpeningSizeChanges([opening, { ...other, quantity: 2 }], [{ ...change, quantity: 1, splitOpeningId: splitId }, second]));
});

test('each independently resized opening is applied without modifying the other entry', () => {
  const second = { ...change, openingId: otherId, previousQuantity: 1, quantity: 1, width: 160, height: 170 };
  const edits = normalizeOpeningSizeChanges([opening, other], [change, second]);
  assert.deepEqual(applyOpeningSizeChanges([opening, other], edits), [
    { ...opening, width: 130, height: 160 },
    { ...other, width: 160, height: 170 },
  ]);
});

const catalog = [
  { id: 'system', name: 'Alumex System', category: 'aluminum_system', unit: 'sqm', unit_price: 250000, is_active: true },
  { id: 'glass', name: 'Double Glass', category: 'glass_option', unit: 'sqm', unit_price: 15000, is_active: true },
  { id: 'shutter', name: 'Roller Shutter - Foam', category: 'addon', unit: 'item', unit_price: 30000, is_active: true },
  { id: 'handle', name: 'Handle', category: 'addon', unit: 'item', unit_price: 5000, is_active: true },
  { id: 'louver', name: 'Louver', category: 'standalone_product', unit: 'sqm', unit_price: 160000, is_active: true },
];
const selected = {
  openingId: sourceId, systemId: 'system', systemRate: 300000, glassId: 'glass',
  extras: [{ id: 'shutter', quantity: 1, motorPrice: 120000 }, { id: 'handle', quantity: 2 }],
};

test('a size revision preserves negotiated system, glass and accessory rates despite catalog changes', () => {
  const saved = freeze(priceQuotation([opening], [selected], catalog, 'previous-employee'));
  const before = structuredClone(saved);
  const edits = normalizeOpeningSizeChanges([opening], [change]);
  const resized = applyOpeningSizeChanges([opening], edits);
  const updatedCatalog = catalog.map(product => ({ ...product, unit_price: product.unit_price * 2 }));
  const revised = priceQuotationWithSizeChanges(resized, [selected], updatedCatalog, 'editor', [], 0, saved, edits);
  const line = revised.lines[0];
  assert.equal(line.system.rate, 300000);
  assert.equal(line.system.quantity, 8.32);
  assert.equal(line.glass.rate, 15000);
  assert.equal(line.glass.quantity, 8.32);
  assert.equal(line.extras.find(item => item.id === 'shutter').rate, 30000);
  assert.equal(line.extras.find(item => item.id === 'shutter').quantity, 8.32);
  assert.deepEqual(line.extras.find(item => item.motorFor === 'shutter'), saved.lines[0].extras.find(item => item.motorFor === 'shutter'));
  assert.deepEqual(line.extras.find(item => item.id === 'handle'), saved.lines[0].extras.find(item => item.id === 'handle'));
  assert.equal(revised.total, Math.round(8.32 * 300000) + Math.round(8.32 * 15000) + Math.round(8.32 * 30000) + 4 * 120000 + 8 * 5000);
  assert.deepEqual(saved, before, 'A new size revision cannot modify the archived quotation');
});

test('a partial resize clones chosen specifications and preserves physical quantities, motor counts and per-copy extras', () => {
  const saved = priceQuotation([opening], [selected], catalog, 'previous-employee');
  const edits = normalizeOpeningSizeChanges([opening], [{ ...change, quantity: 1, splitOpeningId: splitId }]);
  const resized = applyOpeningSizeChanges([opening], edits);
  const choices = resized.map(row => ({ ...selected, openingId: row.id }));
  const revised = priceQuotationWithSizeChanges(resized, choices, catalog, 'editor', [], 0, saved, edits);
  assert.equal(revised.lines.length, 2);
  const source = revised.lines.find(line => line.opening.id === sourceId);
  const split = revised.lines.find(line => line.opening.id === splitId);
  assert.equal(source.opening.quantity, 3);
  assert.equal(split.opening.quantity, 1);
  assert.equal(source.system.rate, split.system.rate);
  assert.equal(source.glass.rate, split.glass.rate);
  assert.equal(source.extras.find(item => item.motorFor === 'shutter').quantity, 3);
  assert.equal(split.extras.find(item => item.motorFor === 'shutter').quantity, 1);
  assert.equal(source.extras.find(item => item.id === 'handle').quantity, 6);
  assert.equal(split.extras.find(item => item.id === 'handle').quantity, 2);
  assert.equal(revised.lines.reduce((sum, line) => sum + line.extras.find(item => item.motorFor === 'shutter').total, 0), 480000);
  assert.equal(revised.lines.reduce((sum, line) => sum + line.extras.find(item => item.id === 'handle').total, 0), 40000);
});

test('changing dimensions retains the window billing minimum and uses raw measured area for shutters', () => {
  const baseline = { ...opening, width: 90, height: 90, quantity: 1 };
  const edits = normalizeOpeningSizeChanges([baseline], [{ ...change, previousWidth: 90, previousHeight: 90, previousQuantity: 1, width: 50, height: 60, quantity: 1 }]);
  const saved = priceQuotation([baseline], [selected], catalog, 'previous-employee');
  const revised = priceQuotationWithSizeChanges(applyOpeningSizeChanges([baseline], edits), [selected], catalog, 'editor', [], 0, saved, edits);
  const line = revised.lines[0];
  assert.equal(line.area, 0.3);
  assert.equal(line.system.quantity, 1);
  assert.equal(line.glass.quantity, 1);
  assert.equal(line.extras.find(item => item.id === 'shutter').quantity, 0.3);
  assert.equal(line.extras.find(item => item.motorFor === 'shutter').quantity, 1);
});

test('changing a louver size applies its minimum width and height independently', () => {
  const baseline = { ...opening, width: 200, height: 100, quantity: 2, opening_type: 'Louver', opening_direction: 'Hinged', has_arch: false, has_roller_shutter: false };
  const choices = [{ openingId: sourceId, systemId: 'louver', extras: [] }];
  const edits = normalizeOpeningSizeChanges([baseline], [{ ...change, previousWidth: 200, previousHeight: 100, previousQuantity: 2, width: 50, height: 200, quantity: 2 }]);
  const saved = priceQuotation([baseline], choices, catalog, 'previous-employee');
  const revised = priceQuotationWithSizeChanges(applyOpeningSizeChanges([baseline], edits), choices, catalog, 'editor', [], 0, saved, edits);
  assert.equal(revised.lines[0].area, 2);
  assert.equal(revised.lines[0].system.quantity, 4, 'Each 50×200 cm louver bills as 100×200 cm');
  assert.equal(revised.lines[0].system.rate, 160000);
});

test('a size edit can explicitly change the negotiated system rate and motor price', () => {
  const saved = priceQuotation([opening], [selected], catalog, 'previous-employee');
  const edits = normalizeOpeningSizeChanges([opening], [change]);
  const changed = { ...selected, systemRate: 320000, extras: selected.extras.map(item => item.id === 'shutter' ? { ...item, motorPrice: 140000 } : item) };
  const revised = priceQuotationWithSizeChanges(applyOpeningSizeChanges([opening], edits), [changed], catalog, 'editor', [], 0, saved, edits);
  assert.equal(revised.lines[0].system.rate, 320000);
  assert.equal(revised.lines[0].extras.find(item => item.motorFor === 'shutter').rate, 140000);
});
