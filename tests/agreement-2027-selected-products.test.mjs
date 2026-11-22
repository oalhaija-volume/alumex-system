import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const cache = new Map();
function load(path) {
 const initial = path instanceof URL ? path : new URL(path, import.meta.url);
 const url = existsSync(initial) ? initial : ['.ts', '.tsx', '.json'].map(extension => new URL(initial.href + extension)).find(candidate => existsSync(candidate));
 assert.ok(url, `Missing module ${initial}`);
 if (cache.has(url.href)) return cache.get(url.href);
 if (url.pathname.endsWith('.json')) return JSON.parse(readFileSync(url, 'utf8'));
 const exports = {}; cache.set(url.href, exports);
 const source = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 new Function('require', 'exports', source)(name => {
  if (name.startsWith('@/')) return load(`../src/${name.slice(2)}`);
  if (name.startsWith('.')) return load(new URL(name, url));
  throw new Error(`Unexpected selected-product dependency ${name}`);
 }, exports);
 return exports;
}

const { selectedAgreement2027Products } = load('../src/lib/contracts/agreement2027Products.ts');
const charge = (id, name, rate, quantity = 1, unit = 'sqm') => ({ id, name, unit, rate, quantity, total: rate * quantity });
function quotation({ model = 'A16', name = 'Alumex System', glass = null, extras = [], additionalItems = [] } = {}) {
 const system = charge('generic-system', name, 271_001, 6);
 const line = { opening: { id: 'opening', floor: 'Ground', room: 'Office', width: 200, height: 150, quantity: 2, opening_type: 'Window', opening_direction: 'Sliding' }, system, ...(model == null ? {} : { systemModel: model }), glass, extras, area: 3, total: system.total + (glass?.total ?? 0) + extras.reduce((sum, item) => sum + item.total, 0) };
 const quote = { lines: [line], additionalItems, total: line.total + additionalItems.reduce((sum, item) => sum + item.total + (item.extras ?? []).reduce((subtotal, extra) => subtotal + extra.total, 0), 0), currency: 'IQD', createdAt: '2026-11-22T12:00:00Z', preparedBy: 'indoor' };
 return quote;
}

test('one approved A16 selection produces only its own specification, without unselected systems or optional catalog items', () => {
 const quote = quotation(); const before = structuredClone(quote);
 const selected = selectedAgreement2027Products(quote);
 assert.equal(selected.length, 1);
 assert.equal(selected[0].name, 'ALUMEX A16');
 assert.equal(selected[0].sourceKey, 'alumex-16');
 assert.equal(selected[0].kind, 'system');
 assert.deepEqual(selected[0].rates, [271_001]);
 assert.deepEqual(selected[0].openingIds, ['opening']);
 assert.deepEqual(quote, before);
});

for (const [model, sourceKey] of [['A16', 'alumex-16'], ['A16 Pro', 'alumex-16-pro'], ['A16 Pro+', 'alumex-16-plus'], ['4500', 'alumex-4500'], ['4500 Pro', 'alumex-4500-pro']]) {
 test(`the selected ${model} model determines its original specification block independently of the generic catalog name`, () => {
  const selected = selectedAgreement2027Products(quotation({ model }));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].name, `ALUMEX ${model}`);
  assert.equal(selected[0].sourceKey, sourceKey);
 });
}

for (const name of ['ALUMEX 16 PRO+', 'ALUMEX A16 Pro+', 'ALUMEX 16 PLUS']) test(`saved product alias ${name} uses the selected Plus block without changing its approved name or rate`, () => {
 const quote = quotation({ model: null, name });
 const selected = selectedAgreement2027Products(quote);
 assert.equal(selected.length, 1);
 assert.equal(selected[0].sourceKey, 'alumex-16-plus');
 assert.equal(selected[0].name, name);
 assert.deepEqual(selected[0].rates, [271_001]);
});

test('different models using one catalog product remain separate, while repeated identical models keep every approved rate and opening specification', () => {
 const quote = quotation();
 const second = structuredClone(quote.lines[0]); second.opening.id = 'second'; second.system.rate = 279_007; second.system.total = second.system.quantity * second.system.rate;
 const hinged = structuredClone(quote.lines[0]); hinged.opening.id = 'hinged'; hinged.opening.opening_type = 'Door'; hinged.opening.opening_direction = 'Hinged'; hinged.systemModel = '4500';
 quote.lines.push(second, hinged);
 second.total = second.system.total;
 quote.total = quote.lines.reduce((sum, line) => sum + line.total, 0);
 const specifications = [
  { openingId: 'opening', aluminumColor: 'لون برونزي معتمد', glassColor: '', bottomFrame: 'عتبة أولى', notes: 'تفصيل الفتحة الأولى', technicalDescription: 'المواصفة المعتمدة الأولى' },
  { openingId: 'second', aluminumColor: 'لون أسود معتمد', glassColor: '', bottomFrame: '', notes: 'تفصيل الفتحة الثانية', technicalDescription: 'المواصفة المعتمدة الثانية' },
 ];
 const before = structuredClone({ quote, specifications });
 const selected = selectedAgreement2027Products(quote, specifications);
 assert.equal(selected.length, 2);
 const sliding = selected.find(product => product.sourceKey === 'alumex-16');
 assert.ok(sliding);
 assert.deepEqual([...sliding.rates].sort((a, b) => a - b), [271_001, 279_007]);
 assert.deepEqual([...sliding.openingIds].sort(), ['opening', 'second']);
 assert.deepEqual([...sliding.technicalDescriptions].sort(), specifications.map(item => item.technicalDescription).sort());
 for (const phrase of ['لون برونزي معتمد', 'لون أسود معتمد', 'عتبة أولى', 'تفصيل الفتحة الأولى', 'تفصيل الفتحة الثانية']) assert.ok(sliding.details.some(detail => detail.includes(phrase)), phrase);
 assert.equal(selected.filter(product => product.sourceKey === 'alumex-4500').length, 1);
 assert.deepEqual({ quote, specifications }, before);
});

test('mixed approved windows, curtain walls, skylights and standalone doors retain their selected systems and attached extras only', () => {
 const curtain = { ...charge('curtain', 'ALUMEX CURTAIN WALL C W 60', 312_345, 24), curtainWallGlassType: 'double', extras: [charge('arch', 'Curtain Wall Arch', 150_000, 2, 'item')] };
 const skylight = { ...charge('skylight', 'ALUMEX SKYLIGHT C W 60', 430_987, 6), extras: [charge('sub-frame', 'Sub Frame', 17_000, 8, 'meter')] };
 const door = charge('standalone-door', 'ALUMEX SWING DOOR', 516_789, 2, 'item');
 const quote = quotation({ additionalItems: [door, skylight, curtain] }); const before = structuredClone(quote);
 const selected = selectedAgreement2027Products(quote);
 assert.deepEqual(selected.filter(product => product.kind === 'system').map(product => product.sourceKey), ['alumex-16', 'alumex-curtain-wall-cw60', 'alumex-skylight-cw60', 'alumex-swing-door'], 'Selected systems follow the original reference order even when the approved quote used another entry order');
 for (const [name, rate] of [[curtain.name, curtain.rate], [skylight.name, skylight.rate], [door.name, door.rate], [curtain.extras[0].name, curtain.extras[0].rate], [skylight.extras[0].name, skylight.extras[0].rate]]) {
  const item = selected.find(product => product.name === name); assert.ok(item, name); assert.ok(item.rates.includes(rate), name);
 }
 assert.equal(selected.filter(product => product.sourceKey === 'alumex-curtain-wall-cw60').length, 1);
 assert.equal(selected.filter(product => product.sourceKey === 'alumex-skylight-cw60').length, 1);
 assert.equal(selected.filter(product => product.sourceKey === 'alumex-16-pro').length, 0);
 assert.equal(selected.filter(product => product.sourceKey === 'the-address-as-a18').length, 0);
 assert.deepEqual(quote, before);
});

test('only selected glass and accessories appear, with no rows inferred from zero-priced or zero-quantity optional placeholders', () => {
 const glass = charge('glass', 'Low-E Glass', 20_000, 6);
 const extra = charge('bars', 'Georgian bars', 5_000, 4, 'meter');
 const quote = quotation({ glass, extras: [extra], additionalItems: [charge('unused-mirror', 'Glass Mirror', 0, 0), charge('unused-tilt', 'Turn And Tilt', 0, 0, 'item')] });
 const selected = selectedAgreement2027Products(quote);
 assert.deepEqual(selected.filter(product => product.kind === 'glass').map(product => product.name), ['Low-E Glass']);
 assert.deepEqual(selected.filter(product => product.kind === 'addon').map(product => product.name), ['Georgian bars']);
 assert.deepEqual(selected.find(product => product.name === glass.name).rates, [20_000]);
 assert.deepEqual(selected.find(product => product.name === extra.name).rates, [5_000]);
 assert.equal(selected.some(product => ['Glass Mirror', 'Turn And Tilt'].includes(product.name)), false);
 assert.deepEqual(selectedAgreement2027Products(quotation()).map(product => product.kind), ['system']);
});

test('an explicitly selected included glass or accessory is retained even when its approved separate charge is zero', () => {
 const quote = quotation({ glass: charge('included-glass', 'Included Clear Glass', 0, 6), extras: [charge('included-latch', 'Included Safety Latch', 0, 2, 'item')] });
 const selected = selectedAgreement2027Products(quote);
 for (const [name, kind] of [['Included Clear Glass', 'glass'], ['Included Safety Latch', 'addon']]) {
  const product = selected.find(item => item.name === name); assert.ok(product, name);
  assert.equal(product.kind, kind); assert.deepEqual(product.rates, [0]);
 }
});

test('an unknown approved system preserves its actual name, price and saved technical details without guessing a catalog model', () => {
 const quote = quotation({ model: null, name: 'BESPOKE NARROW-FRAME X9' });
 const specifications = [{ openingId: 'opening', aluminumColor: 'برونزي خاص', glassColor: 'شفاف معتمد', bottomFrame: 'عتبة معتمدة', notes: 'المقبض في الموضع الموقّع', technicalDescription: 'مواصفة X9 المعتمدة: عمق 77 ملم وسماكة 2.4 ملم' }];
 const selected = selectedAgreement2027Products(quote, specifications);
 assert.equal(selected.length, 1);
 assert.equal(selected[0].name, 'BESPOKE NARROW-FRAME X9');
 assert.equal(selected[0].sourceKey, undefined);
 assert.deepEqual(selected[0].rates, [271_001]);
 assert.deepEqual(selected[0].technicalDescriptions, [specifications[0].technicalDescription]);
 for (const text of ['برونزي خاص', 'شفاف معتمد', 'عتبة معتمدة', 'المقبض في الموضع الموقّع']) assert.ok(selected[0].details.some(detail => detail.includes(text)), text);
});

test('a long approved standalone selection is not truncated to the number of product slots in the reference PDF', () => {
 const products = Array.from({ length: 45 }, (_, index) => charge(`approved-${index}`, `Approved bespoke product ${index + 1}`, 100_001 + index, index + 1, 'item'));
 const quote = quotation({ additionalItems: products });
 const selected = selectedAgreement2027Products(quote);
 assert.equal(selected.length, 46);
 for (const product of products) assert.ok(selected.some(item => item.name === product.name && item.rates.includes(product.rate)), product.name);
});

test('a generic photocell selection keeps its saved name and price without guessing either GEZZE or EX equipment', () => {
 const quote = quotation({ model: null, name: 'ALUMEX PHOTO CELL DOOR' });
 const selected = selectedAgreement2027Products(quote);
 assert.equal(selected.length, 1); assert.equal(selected[0].name, 'ALUMEX PHOTO CELL DOOR');
 assert.equal(selected[0].sourceKey, undefined); assert.deepEqual(selected[0].rates, [271_001]);
 assert.deepEqual(selected[0].technicalDescriptions, []);
});

test('photocell specifications come from the matching approved opening and preserve an explicitly recorded description exactly', () => {
 const quote = quotation({ model: null, name: 'ALUMEX PHOTO CELL DOOR' });
 const other = { openingId: 'unrelated-opening', aluminumColor: '', glassColor: '', bottomFrame: '', notes: '', technicalDescription: 'GEZZE الخاص بفتحة أخرى وليس بهذا الاختيار' };
 assert.deepEqual(selectedAgreement2027Products(quote, [other])[0].technicalDescriptions, []);
 const matching = { ...other, openingId: 'opening', technicalDescription: 'ماكينة EX مع تجهيز GEZZE الإضافي حسب المخطط المعتمد لهذا المشروع فقط' };
 const before = structuredClone({ quote, other, matching });
 const selected = selectedAgreement2027Products(quote, [other, matching]);
 assert.deepEqual(selected[0].technicalDescriptions, [matching.technicalDescription]);
 assert.deepEqual({ quote, other, matching }, before);
});

for (const [variant, sourceKey, opposite] of [['GEZZE', 'photo-cell-geze', 'EX'], ['EX', 'photo-cell-ex', 'GEZZE']]) test(`an explicitly selected ${variant} photocell variant selects its own source family without inventing the other variant`, () => {
 const name = `ALUMEX PHOTO CELL DOOR ${variant}`;
 const selected = selectedAgreement2027Products(quotation({ model: null, name }));
 assert.equal(selected.length, 1); assert.equal(selected[0].name, name); assert.equal(selected[0].sourceKey, sourceKey);
 assert.equal(selected[0].technicalDescriptions.some(description => new RegExp(`\\b${opposite}\\b`, 'i').test(description)), false);
});
