import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', source)(exports);
  return exports;
}

const { contractDeliverySummary } = load('../src/lib/contracts/deliveryDuration.ts');
const clause = text => ({ title: 'الخامس عشر: التزامات الفريق الثاني', text });
const standard = clause('مدة تنفيذ المشروع للمراحل الجاهزة هي (60) ستون يوم عمل باستثناء الظروف القاهرة والعطل الرسمية.\nتحسب المدة من تاريخ اعتماد المخططات أو تسديد الدفعة المستحقة، أيهما لاحقاً.');

test('the standard sixty working days are summarized from the saved delivery clause', () => {
  assert.equal(contractDeliverySummary([standard]), '60 يوم عمل وفق شروط العقد');
});

test('a per-contract thirty-working-day amendment changes only that contract summary', () => {
  const amended = clause(standard.text.replace('(60) ستون', '(30) ثلاثون'));
  const terms = [amended], original = structuredClone(terms);
  assert.equal(contractDeliverySummary(terms), '30 يوم عمل وفق شروط العقد');
  assert.equal(contractDeliverySummary([standard]), '60 يوم عمل وفق شروط العقد');
  assert.deepEqual(terms, original, 'Cover rendering must not change the saved contract');
});

test('an explicit calendar-day promise is distinguished from working days', () => {
  const terms = [clause('مدة تنفيذ المشروع للمراحل الجاهزة هي (30) ثلاثون يوماً تقويمياً وفق الشروط المتفق عليها.')];
  assert.equal(contractDeliverySummary(terms), '30 يوم تقويمي وفق شروط العقد');
  assert.equal(contractDeliverySummary([clause('مدة تنفيذ المشروع هي (30) ثلاثون يوم تقويمي.')]), '30 يوم تقويمي وفق شروط العقد');
  assert.equal(contractDeliverySummary([clause('مدة تنفيذ المشروع هي (30) ثلاثون يوماً تقويمياً، وتعتمد المخططات خلال سبعة أيام عمل.')]), '30 يوم تقويمي وفق شروط العقد');
});

for (const digits of ['٣٠', '۳۰']) test(`saved Arabic digits ${digits} retain their delivery amount`, () => {
  assert.equal(contractDeliverySummary([clause(`مدة تنفيذ المشروع للمراحل الجاهزة هي (${digits}) ثلاثون يوم عمل.`)]), '30 يوم عمل وفق شروط العقد');
});

test('other contract time limits and prices cannot supply the project duration', () => {
  const terms = [
    { title: 'اعتماد المخططات', text: 'يجب اعتماد المخططات خلال (7) سبعة أيام عمل.' },
    { title: 'استئناف الأعمال', text: 'تستأنف الأعمال خلال (15) خمسة عشر يوم عمل.' },
    { title: 'السعر', text: 'سعر الباب (1000) ألف دولار أو ما يعادله بالدينار العراقي يوم السداد.' },
    standard,
  ];
  assert.equal(contractDeliverySummary(terms), '60 يوم عمل وفق شروط العقد');
  assert.equal(contractDeliverySummary(terms.slice(0, 3)), 'وفق شروط العقد');
});

for (const text of [
  'مدة تنفيذ المشروع للمراحل الجاهزة هي (0) صفر يوم عمل.',
  'مدة تنفيذ المشروع للمراحل الجاهزة هي (-30) يوم عمل.',
  'مدة تنفيذ المشروع للمراحل الجاهزة هي (30.5) يوم عمل.',
  'مدة تنفيذ المشروع للمراحل الجاهزة هي (9007199254740992) يوم عمل.',
  'مدة تنفيذ المشروع للمراحل الجاهزة هي (30) ثلاثون يوماً حسب الاتفاق.',
  'مدة تنفيذ المشروع للمراحل الجاهزة هي (30) ثلاثون يوماً حسب الاتفاق، وتعتمد المخططات خلال سبعة أيام عمل.',
  'مدة تنفيذ المشروع للمراحل الجاهزة هي ثلاثون يوم عمل.',
]) test(`unclear or invalid delivery wording uses the nonnumeric fallback: ${text}`, () => {
  assert.equal(contractDeliverySummary([clause(text)]), 'وفق شروط العقد');
});

test('missing or conflicting delivery clauses do not invent a promise', () => {
  for (const terms of [undefined, null, [], [clause('')], [standard, clause('مدة تنفيذ المشروع هي (30) ثلاثون يوم عمل.')]]) {
    assert.equal(contractDeliverySummary(terms), 'وفق شروط العقد');
  }
});
