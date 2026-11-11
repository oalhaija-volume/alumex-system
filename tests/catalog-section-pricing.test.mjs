import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

const rules = load('../src/lib/workflow/catalogRules.ts');
const { priceQuotation, repriceQuotation, systemOptions } = load('../src/lib/workflow/pricing.ts', { './catalogRules': rules });
const section = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Custom Thermal Section',
  category: 'aluminum_section', unit: 'sqm', unit_price: 500000, is_active: true,
};
const openings = [
  { id: 'window', floor: 'GF', room: 'Kitchen', width: 240, height: 300, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding' },
  { id: 'door', floor: 'GF', room: 'Bathroom', width: 75, height: 280, quantity: 1, opening_type: 'Door', opening_direction: 'Hinged' },
  { id: 'small-window', floor: 'F1', room: 'Store', width: 50, height: 80, quantity: 3, opening_type: 'Window', opening_direction: 'Hinged' },
];
const choices = openings.map(opening => ({ openingId: opening.id, systemId: section.id, extras: [] }));

test('a newly added aluminum section is selectable for windows and doors and charges its sqm price', () => {
  const original = structuredClone({ section, openings, choices });
  for (const opening of openings) assert.deepEqual(systemOptions(opening, [section]), [section]);
  assert.equal(rules.catalogKind(section), 'system');
  const quote = priceQuotation(openings, choices, [section], 'admin');
  assert.deepEqual(quote.lines.map(line => [line.system.unit, line.system.rate, line.system.quantity, line.total]), [
    ['sqm', 500000, 14.4, 7200000],
    ['sqm', 500000, 2.1, 1050000],
    ['sqm', 500000, 3, 1500000],
  ]);
  assert.equal(quote.total, 9750000);
  assert.deepEqual({ section, openings, choices }, original);
});

test('changing the added section price affects future pricing while saved quotation amounts remain intact', () => {
  const saved = priceQuotation(openings, choices, [section], 'admin');
  const original = structuredClone(saved);
  const changed = [{ ...section, unit_price: 600000 }];
  assert.equal(priceQuotation(openings, choices, changed, 'admin').total, 11700000);
  assert.equal(repriceQuotation(saved, changed, 'admin').total, 11700000);
  assert.deepEqual(saved, original);
  assert.equal(saved.total, 9750000);
});
