import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/contracts/agreement2027Content.ts', import.meta.url), 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contentExports = {};
new Function('exports', source)(contentExports);
const { agreement2027Terms, agreement2027PaymentSchedule, arabicDinarAmount, agreement2027Readiness, agreement2027SpecificationNotes, productTechnicalDescription } = contentExports;

for (const kind of ['residential', 'commercial']) {
 test(`${kind}: contracts below fifteen million require the whole amount upfront`, () => {
  for (const total of [0, 1, 14_999_999]) {
   const result = agreement2027PaymentSchedule(total, kind);
   assert.equal(result.length, 1);
   assert.deepEqual({ id: result[0].id, percent: result[0].percent, amount: result[0].amount }, { id: 'signing', percent: 100, amount: total });
   assert.match(result[0].trigger, /توقيع العقد/);
  }
 });
}

test('fifteen million exactly follows the selected factory or commercial schedule', () => {
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

test('commercial due dates preserve seven-day invoice periods and final payment before finishing', () => {
 const schedule = agreement2027PaymentSchedule(25_000_000, 'commercial');
 for (const stage of schedule.slice(1, 5)) assert.match(stage.trigger, /سبعة أيام.*الفاتورة.*المستندات/);
 assert.match(schedule.at(-1).trigger, /قبل التشطيب النهائي.*سلكون.*البرشر.*الكاب/);
 assert.match(agreement2027PaymentSchedule(25_000_000, 'residential').at(-1).trigger, /سبعة أيام.*إخبار الفريق الأول/);
});

test('invalid amounts and template kinds cannot produce a financial contract representation', () => {
 for (const value of [-1, -0.5, 1.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '15000000', null, undefined, true, {}, []]) {
  assert.throws(() => agreement2027PaymentSchedule(value, 'residential'), /whole IQD/);
  assert.throws(() => arabicDinarAmount(value), /whole IQD/);
 }
 for (const kind of ['', null, undefined, 'Residential', 'other']) {
  assert.throws(() => agreement2027PaymentSchedule(25_000_000, kind), /contract template/);
  assert.throws(() => agreement2027Terms(kind), /contract template/);
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
  assert.match(terms[2].text, /15,000,000.*100%/s);
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
 assert.match(agreement2027Terms('commercial')[2].text, /30%.*65%.*20%.*10%.*20%.*15%.*5%/s);
 assert.match(agreement2027Terms('residential')[2].text, /50%.*50%/s);
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
