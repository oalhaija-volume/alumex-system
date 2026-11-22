import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const cache = new Map();
function load(path) {
 const url = path instanceof URL ? path : new URL(path, import.meta.url);
 if (cache.has(url.href)) return cache.get(url.href);
 const exports = {};
 cache.set(url.href, exports);
 const code = ts.transpileModule(readFileSync(url, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText;
 new Function('require', 'exports', code)(name => {
  if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
  throw new Error(`Unexpected contract dependency: ${name}`);
 }, exports);
 return exports;
}

const { buildAgreement2027Snapshot, emptyAgreement2027Fields } = load('../src/lib/contracts/agreement2027.ts');
const { agreement2027PaymentSchedule, agreement2027PaymentSchedules } = load('../src/lib/contracts/agreement2027Content.ts');

for (const total of [1, 14_999_999, 15_000_000, 25_000_001, Number.MAX_SAFE_INTEGER]) {
 test(`a historical unified ${total} IQD snapshot retains both payment branches against the approved total`, () => {
  const quote = { total };
  const fields = emptyAgreement2027Fields();
  fields.clientLegalName = '  Existing client  ';
  const specifications = [{ openingId: 'opening', aluminumColor: 'black', glassColor: 'clear', bottomFrame: '', notes: 'Approved detail' }];
  const before = structuredClone({ quote, fields, specifications });
  const snapshot = buildAgreement2027Snapshot(quote, 'unified', fields, specifications);
  assert.equal(snapshot.version, 'agreement-2027');
  assert.equal(snapshot.total, total);
  assert.equal(snapshot.fields.clientLegalName, 'Existing client');
  assert.deepEqual(snapshot.paymentSchedule, []);
  assert.deepEqual(snapshot.paymentSchedules, agreement2027PaymentSchedules(total));
  assert.deepEqual(snapshot.openingSpecifications, specifications);
  assert.deepEqual({ quote, fields, specifications }, before);
  for (const schedule of snapshot.paymentSchedules) {
   assert.equal(schedule.stages.reduce((sum, stage) => sum + BigInt(stage.amount), BigInt(0)), BigInt(total));
  }
 });
}

test('historical unified snapshots preserve the shape and amounts of selected template snapshots', () => {
 for (const kind of ['residential', 'commercial']) {
  const legacy = buildAgreement2027Snapshot({ total: 25_000_001 }, kind, emptyAgreement2027Fields());
  const before = structuredClone(legacy);
  const unified = buildAgreement2027Snapshot({ total: 25_000_001 }, 'unified', emptyAgreement2027Fields());
  assert.deepEqual(legacy.paymentSchedule, agreement2027PaymentSchedule(legacy.total, kind));
  assert.equal(Object.hasOwn(legacy, 'paymentSchedules'), false);
  unified.paymentSchedules[0].stages[0].amount = 0;
  unified.fields.approvals.salesEngineer.name = 'Changed';
  unified.readiness.measurement[0] = 'Changed';
  assert.deepEqual(legacy, before);
  const next = buildAgreement2027Snapshot({ total: 25_000_001 }, 'unified', emptyAgreement2027Fields());
  assert.deepEqual(next.paymentSchedules, agreement2027PaymentSchedules(next.total));
  assert.equal(next.fields.approvals.salesEngineer.name, '');
  assert.notEqual(next.readiness.measurement[0], 'Changed');
 }
});

test('unified snapshots reject invalid approved totals and client-supplied payment fields', () => {
 for (const total of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '15000000']) {
  assert.throws(() => buildAgreement2027Snapshot({ total }, 'unified', emptyAgreement2027Fields()), /whole IQD/);
 }
 assert.throws(() => buildAgreement2027Snapshot({ total: 25_000_000 }, 'unified', { ...emptyAgreement2027Fields(), paymentSchedules: [] }), /unsupported field/);
});

for (const kind of ['residential', 'commercial']) for (const total of [1, 14_999_999, 15_000_000, 25_000_001, Number.MAX_SAFE_INTEGER]) {
 test(`the selected ${kind} ${total} IQD snapshot contains its payment policy only`, () => {
  const quote = { total };
  const fields = emptyAgreement2027Fields();
  const snapshot = buildAgreement2027Snapshot(quote, kind, fields);
  assert.equal(snapshot.total, total);
  assert.deepEqual(snapshot.paymentSchedule, agreement2027PaymentSchedule(total, kind));
  assert.equal(Object.hasOwn(snapshot, 'paymentSchedules'), false);
  assert.deepEqual(snapshot.paymentSchedule.map(stage => stage.percent), total < 15_000_000 ? [100] : kind === 'residential' ? [50, 50] : [30, 20, 10, 20, 15, 5]);
  assert.equal(snapshot.paymentSchedule.reduce((sum, stage) => sum + BigInt(stage.amount), 0n), BigInt(total));
  assert.deepEqual(quote, { total });
  assert.deepEqual(fields, emptyAgreement2027Fields());
 });
}
