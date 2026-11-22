import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/contracts/agreement2027Content.ts', import.meta.url), 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contentExports = {};
new Function('exports', source)(contentExports);
const { agreement2027Terms, agreement2027PaymentSchedule, agreement2027PaymentSchedules, arabicDinarAmount, agreement2027Readiness, agreement2027SpecificationNotes, productTechnicalDescription } = contentExports;

test('residential contracts at or above fifteen million follow the source PDF: half at signing and half when the goods are ready', () => {
 for (const total of [15_000_000, 25_000_000]) {
  const result = agreement2027PaymentSchedule(total, 'residential');
  assert.deepEqual(result.map(stage => [stage.id, stage.percent]), [['signing', 50], ['before-installation', 50]]);
  assert.equal(result.reduce((sum, stage) => sum + stage.amount, 0), total);
  assert.match(result[0].trigger, /توقيع العقد/);
  assert.match(result[1].trigger, /جهوزية البضاعة.*سبعة أيام/);
 }
});

test('the source PDF whole-amount upfront exception applies to either contract type below fifteen million', () => {
  for (const kind of ['residential', 'commercial']) for (const total of [0, 1, 14_999_999]) {
   const result = agreement2027PaymentSchedule(total, kind);
   assert.equal(result.length, 1);
   assert.deepEqual({ id: result[0].id, percent: result[0].percent, amount: result[0].amount }, { id: 'signing', percent: 100, amount: total });
   assert.match(result[0].trigger, /توقيع العقد/);
  }
});

test('fifteen million exactly follows the selected residential or restored commercial schedule', () => {
 assert.deepEqual(agreement2027PaymentSchedule(15_000_000, 'residential').map(stage => [stage.percent, stage.amount]), [[50, 7_500_000], [50, 7_500_000]]);
 assert.deepEqual(agreement2027PaymentSchedule(15_000_000, 'commercial').map(stage => [stage.id, stage.percent, stage.amount]), [
  ['signing', 30, 4_500_000], ['profiles-delivered', 20, 3_000_000], ['profiles-installed', 10, 1_500_000],
  ['glass-delivered', 20, 3_000_000], ['glass-installed', 15, 2_250_000], ['before-finishing', 5, 750_000],
 ]);
});

test('whole-IQD installments reconcile to the approved amount, including rounding and large safe amounts', () => {
 for (const total of [15_000_001, 15_000_003, 25_710_534, 99_999_999, 1_000_000_000_001, Number.MAX_SAFE_INTEGER]) {
  for (const kind of ['residential', 'commercial']) {
   const result = agreement2027PaymentSchedule(total, kind);
   assert.equal(result.reduce((sum, stage) => sum + BigInt(stage.amount), BigInt(0)), BigInt(total));
   assert.equal(result.reduce((sum, stage) => sum + stage.percent, 0), 100);
   assert.ok(result.every(stage => Number.isSafeInteger(stage.amount) && stage.amount >= 0));
  }
 }
 assert.deepEqual(agreement2027PaymentSchedule(15_000_001, 'residential').map(stage => stage.amount), [7_500_001, 7_500_000]);
 assert.equal(agreement2027PaymentSchedule(15_000_001, 'commercial').at(-1).amount, 750_001);
});

test('one agreement includes both existing payment policies without combining their payable amounts', () => {
 for (const total of [0, 1, 14_999_999, 15_000_000, 25_000_001, Number.MAX_SAFE_INTEGER]) {
  const schedules = agreement2027PaymentSchedules(total);
  assert.deepEqual(schedules.map(schedule => schedule.id), ['residential', 'commercial']);
  assert.match(schedules[0].label, /السكنية/);
  assert.match(schedules[1].label, /التجارية/);
  for (const schedule of schedules) {
   assert.deepEqual(schedule.stages, agreement2027PaymentSchedule(total, schedule.id));
   assert.equal(schedule.stages.reduce((sum, stage) => sum + stage.percent, 0), 100);
   assert.equal(schedule.stages.reduce((sum, stage) => sum + BigInt(stage.amount), BigInt(0)), BigInt(total));
  }
  assert.deepEqual(schedules[0].stages.map(stage => stage.percent), total < 15_000_000 ? [100] : [50, 50]);
  assert.deepEqual(schedules[1].stages.map(stage => stage.percent), total < 15_000_000 ? [100] : [30, 20, 10, 20, 15, 5]);
 }
});

test('the historical unified terms contain both payment branches and retain the source PDF shared minimum-value note', () => {
 const terms = agreement2027Terms();
 assert.deepEqual(terms, agreement2027Terms('unified'));
 assert.deepEqual(terms, agreement2027Terms(undefined));
 assert.equal(terms.length, 19);
 const payments = terms[2].text.split('\n');
 for (const kind of ['residential', 'commercial']) {
  const branch = agreement2027Terms(kind)[2].text.split('\n')[1];
  assert.ok(payments.includes(branch), `The ${kind} payment policy must be retained in full`);
 }
 const exception = payments.find(paragraph => paragraph.includes('15,000,000'));
 assert.match(exception, /100%/);
 assert.doesNotMatch(exception, /للمشاريع التجارية فقط/);
 assert.equal(payments.filter(paragraph => paragraph.includes('كفالة')).length, 1);
 assert.match(terms[2].text, /جهوزية البضاعة.*سبعة أيام/s);
 assert.match(terms[2].text, /65%.*فواتير إنجاز مرحلية.*سبعة أيام/s);
 assert.deepEqual(terms.filter((_, index) => index !== 2), agreement2027Terms('residential').filter((_, index) => index !== 2));
});

test('commercial milestones match all six installments in the source PDF and retain the seven-day invoice period', () => {
 const schedule = agreement2027PaymentSchedule(25_000_000, 'commercial');
 assert.deepEqual(schedule.map(stage => stage.percent), [30, 20, 10, 20, 15, 5]);
 assert.match(schedule[1].trigger, /توريد بروفيلات الألمنيوم إلى الموقع/);
 assert.match(schedule[2].trigger, /تركيب شبكة بروفيلات الألمنيوم/);
 assert.match(schedule[3].trigger, /توريد الزجاج/);
 assert.match(schedule[4].trigger, /تركيب الزجاج/);
 assert.match(schedule.at(-1).trigger, /قبل التشطيب النهائي.*سلكون.*البرشر.*الكاب/);
 assert.ok(schedule.slice(1, 5).every(stage => /سبعة أيام.*المستندات المؤيدة/.test(stage.trigger)));
});

test('invalid amounts and template kinds cannot produce a financial contract representation', () => {
 for (const value of [-1, -0.5, 1.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '15000000', null, undefined, true, {}, []]) {
  assert.throws(() => agreement2027PaymentSchedule(value, 'residential'), /whole IQD/);
  assert.throws(() => agreement2027PaymentSchedules(value), /whole IQD/);
  assert.throws(() => arabicDinarAmount(value), /whole IQD/);
 }
 for (const kind of ['', null, undefined, 'Residential', 'other']) {
  assert.throws(() => agreement2027PaymentSchedule(25_000_000, kind), /contract template/);
  if (kind !== undefined) assert.throws(() => agreement2027Terms(kind), /contract template/);
 }
});

test('known Iraqi dinar amounts are written in Arabic without losing place values', () => {
 const expected = new Map([
  [0, 'فقط صفر دينار عراقي لا غير'],
  [1, 'فقط دينار عراقي واحد لا غير'],
  [2, 'فقط ديناران عراقيان لا غير'],
  [3, 'فقط ثلاثة دنانير عراقية لا غير'],
  [11, 'فقط أحد عشر ديناراً عراقياً لا غير'],
  [12, 'فقط اثنا عشر ديناراً عراقياً لا غير'],
  [100, 'فقط مائة دينار عراقي لا غير'],
  [101, 'فقط مائة ودينار عراقي واحد لا غير'],
  [102, 'فقط مائة وديناران عراقيان لا غير'],
  [200, 'فقط مائتا دينار عراقي لا غير'],
  [1000, 'فقط ألف دينار عراقي لا غير'],
  [2000, 'فقط ألفا دينار عراقي لا غير'],
  [2001, 'فقط ألفان ودينار عراقي واحد لا غير'],
  [10_000, 'فقط عشرة آلاف دينار عراقي لا غير'],
  [15_000_000, 'فقط خمسة عشر مليون دينار عراقي لا غير'],
  [25_710_534, 'فقط خمسة وعشرون مليون وسبعمائة وعشرة آلاف وخمسمائة وأربعة وثلاثون ديناراً عراقياً لا غير'],
  [1_000_000_000, 'فقط مليار دينار عراقي لا غير'],
  [1_000_000_000_000, 'فقط تريليون دينار عراقي لا غير'],
 ]);
 for (const [amount, words] of expected) assert.equal(arabicDinarAmount(amount), words, String(amount));
 assert.match(arabicDinarAmount(Number.MAX_SAFE_INTEGER), /تسعة كوادريليونات.*سبعة تريليونات.*تسعمائة وواحد وتسعون/);
});

test('all nineteen source clauses retain the client-first and company-second obligations', () => {
 for (const kind of ['residential', 'commercial']) {
  const terms = agreement2027Terms(kind);
  assert.equal(terms.length, 19);
  assert.equal(new Set(terms.map(section => section.title)).size, 19);
  assert.match(terms[0].title, /^أولاً/);
  assert.match(terms.at(-1).text, /تسعة عشر بنداً/);
  assert.match(terms[2].text, /الفريق الأول.*للفريق الثاني/);
  if (kind === 'commercial') assert.match(terms[2].text, /15,000,000.*100%/s);
  else { assert.match(terms[2].text, /15,000,000.*100%/s); assert.match(terms[2].text, /جهوزية البضاعة/); }
  assert.match(terms[2].text, /كفالة.*عشرة سنوات.*تسديد كافة المستحقات/);
  assert.match(terms[3].text, /عرض السعر المعتمد المرفق بالعقد/);
  assert.match(terms[4].text, /غير قابلة للاسترداد/);
  assert.match(terms[5].text, /تمديد الفترة الزمنية/);
  assert.match(terms[6].text, /كل مرحلة بشكل منفصل/);
  assert.match(terms[7].text, /إشغال الفريق الأول.*يعتبر مستلماً/s);
  assert.match(terms[8].text, /ملحق رقم \(1\)/);
  assert.match(terms[10].text, /مسؤولية الفريق الأول.*غير شاملة للضمان/s);
  assert.match(terms[11].text, /سبعة أيام عمل.*سبعة أيام عمل/s);
  assert.match(terms[12].text, /خمسة عشر يوم عمل/);
  assert.match(terms[13].text, /السلامة والصحة المهنية.*معالجة المشاكل/s);
  assert.match(terms[14].text, /\(60\).*يوم عمل.*وليس من تاريخ توقيع هذا العقد/s);
  assert.match(terms[15].text, /25,000.*كل يوم تأخير.*ستة أشهر.*إتلاف البضاعة/s);
  assert.match(terms[16].text, /المحاكم العراقية المختصة في العاصمة بغداد/);
  assert.match(terms[17].text, /غير خاضع لأي تخفيض.*عرض سعر جديد.*واتساب.*إيجاب وقبول/s);
 }
 assert.match(agreement2027Terms('commercial')[2].text, /30%.*20%.*10%.*20%.*15%.*5%/s);
 assert.match(agreement2027Terms('residential')[2].text, /50%.*توقيع العقد.*50%.*جهوزية البضاعة.*سبعة أيام/s);
 for (const kind of ['residential', 'commercial', 'unified']) {
  const unchangedClauses = agreement2027Terms(kind).filter((_, index) => index !== 2);
  assert.equal(createHash('sha256').update(JSON.stringify(unchangedClauses)).digest('hex'), 'e9f32d273716bf73282d02263abe469b6d16718c9d3e75a87936f1585c1fec50', 'The other eighteen agreement clauses must remain unchanged');
 }
});

test('terms and payment results are independent snapshots and do not rewrite earlier versions', () => {
 const legacy = readFileSync(new URL('../src/lib/contracts/uploadedTerms.json', import.meta.url), 'utf8');
 const first = agreement2027Terms('commercial');
 const before = structuredClone(first);
 const next = agreement2027Terms('commercial');
 next[0].text = 'Changed on a later draft';
 next.push({ title: 'Forged', text: 'Extra' });
 assert.deepEqual(first, before);
 assert.equal(agreement2027Terms('commercial').length, 19);
 const schedule = agreement2027PaymentSchedule(25_000_000, 'commercial');
 schedule[0].amount = 1;
 assert.equal(agreement2027PaymentSchedule(25_000_000, 'commercial')[0].amount, 7_500_000);
 const unified = agreement2027PaymentSchedules(25_000_000);
 unified[0].stages[0].amount = 1;
 unified[1].stages[0].trigger = 'Changed';
 assert.deepEqual(agreement2027PaymentSchedules(25_000_000).map(schedule => schedule.stages), ['residential', 'commercial'].map(kind => agreement2027PaymentSchedule(25_000_000, kind)));
 const unifiedTerms = agreement2027Terms();
 unifiedTerms[2].text = 'Changed';
 assert.match(agreement2027Terms()[2].text, /للمشاريع السكنية.*للمشاريع التجارية/s);
 assert.equal(readFileSync(new URL('../src/lib/contracts/uploadedTerms.json', import.meta.url), 'utf8'), legacy);
});

test('the readiness annex preserves both checklists and all four source notes', () => {
 assert.equal(agreement2027Readiness.measurement.length, 5);
 assert.equal(agreement2027Readiness.installation.length, 8);
 assert.equal(agreement2027Readiness.notes.length, 4);
 assert.match(agreement2027Readiness.measurement.join('\n'), /شبابيك الحمامات.*صندوق الأباجور/s);
 assert.match(agreement2027Readiness.installation.join('\n'), /الفتحات الإنشائية.*الأرضيات.*الكهرباء/s);
 assert.match(agreement2027Readiness.notes[0], /الفلل.*ثلاث مراحل.*الصغيرة مرحلة واحدة.*التشطيب النهائي/s);
 assert.match(agreement2027Readiness.notes[3], /لون الألمنيوم.*الزجاج الداخلي والخارجي.*اتجاهات الفتح.*أماكن وارتفاعات المسكات/s);
 assert.ok(Object.isFrozen(agreement2027Readiness) && Object.isFrozen(agreement2027Readiness.notes));
 assert.throws(() => agreement2027Readiness.notes.push('Forged'));
});

test('approved-product technical descriptions contain no rate-card prices or guessed generic system', () => {
 assert.match(productTechnicalDescription('  alumex 16 pro '), /14 سم.*1\.6 إلى 2 ملم/);
 assert.match(productTechnicalDescription('THE ADDRESS AH 650 – 660 - 688'), /6 سم.*2 إلى 2\.5 ملم/);
 assert.match(productTechnicalDescription('ALUMEX PUSH OUT'), /شامل إطار الألمنيوم والزجاج/);
 assert.equal(productTechnicalDescription('Alumex System'), undefined);
 assert.equal(productTechnicalDescription('Alumex'), undefined);
 assert.equal(productTechnicalDescription('Not a model'), undefined);
 for (const model of ['ALUMEX 16', 'ALUMEX 16 PRO', 'ALUMEX 4500', 'ALUMEX CURTAIN WALL C W 60', 'THE ADDRESS AS A18']) {
  assert.doesNotMatch(productTechnicalDescription(model), /دينار|250,000|300,000|500,000/);
 }
 assert.match(agreement2027SpecificationNotes.join('\n'), /السقالات.*الموافقات الرسمية.*EPDM.*ذرعة واقع الحال.*ما دون المتر المربع/s);
});
