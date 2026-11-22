import type { AgreementPaymentStage } from './agreement2027Types';

type ContractKind = 'residential' | 'commercial';
type ContractSection = { title: string; text: string };

// Preserve the payment policy used by contracts issued before the source layout.
function validAmount(total: number): void {
 if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
  throw new Error('Enter a non-negative contract amount in whole IQD within the supported range.');
 }
}

// The rates in the source PDF are replaced by the project's approved quotation.
// These are payment percentages, not catalog or quotation product prices.
export function legacyAgreement2027PaymentSchedule(total: number, kind: ContractKind): AgreementPaymentStage[] {
 validAmount(total);
 if (kind !== 'residential' && kind !== 'commercial') throw new Error('Choose the residential or commercial contract template.');
 const definitions = kind === 'residential'
  ? [
    { id: 'signing', label: 'الدفعة الأولى', percent: 50, trigger: 'عند توقيع العقد.' },
    { id: 'before-installation', label: 'الدفعة الثانية والأخيرة', percent: 50, trigger: 'قبل المباشرة بأعمال التركيب في الموقع، وحسب الفاتورة النهائية وفقاً لذرعة واقع الحال.' },
   ]
  : total < 15_000_000
   ? [{ id: 'signing', label: 'الدفعة الكاملة', percent: 100, trigger: 'عند توقيع العقد؛ لأن القيمة الإجمالية أقل من 15,000,000 دينار عراقي.' }]
   : [
    { id: 'signing', label: 'الدفعة الأولى', percent: 25, trigger: 'عند توقيع العقد.' },
    { id: 'profiles-delivered', label: 'توريد بروفيلات الألمنيوم', percent: 25, trigger: 'عند توريد بروفيلات الألمنيوم إلى الموقع.' },
    { id: 'profiles-installed', label: 'تركيب شبكة البروفيلات', percent: 25, trigger: 'عند الانتهاء من نصب هيكل بروفيلات الألمنيوم في الموقع.' },
    { id: 'glass-delivered', label: 'توريد الزجاج', percent: 15, trigger: 'عند توريد الزجاج إلى الموقع وقبل التركيب.' },
    { id: 'before-finishing', label: 'الدفعة الأخيرة', percent: 10, trigger: 'بعد تركيب الزجاج وقبل التشطيب النهائي للسلكون والبرشر والكاب وما يرتبط بها من أعمال، حسب الفاتورة النهائية وفقاً لذرعة واقع الحال.' },
   ];
 let allocated = 0;
 return definitions.map((stage, index) => {
  // BigInt avoids losing IQD when a large, otherwise safe integer is multiplied.
  const amount = index === definitions.length - 1
   ? total - allocated
   : Number((BigInt(total) * BigInt(stage.percent) + BigInt(50)) / BigInt(100));
  allocated += amount;
  return { ...stage, amount };
 });
}

export function legacyAgreement2027Terms(terms: readonly ContractSection[], kind: ContractKind): ContractSection[] {
 if (kind !== 'residential' && kind !== 'commercial') throw new Error('Choose the residential or commercial contract template.');
 const paymentTerms = kind === 'residential'
  ? 'للمشاريع السكنية: يلتزم الفريق الأول بدفع نسبة (50%) من القيمة الإجمالية للعقد إلى الفريق الثاني عند توقيع العقد، وبدفع نسبة (50%) قبل المباشرة بأعمال التركيب في الموقع، وبذلك يكون الفريق الأول قد سدد كامل المبلغ المتبقي في ذمته حسب الفاتورة النهائية الصادرة من قبل الفريق الثاني وفقاً لذرعة واقع الحال.'
  : 'للمشاريع التجارية: يلتزم الفريق الأول بدفع نسبة (25%) من القيمة الإجمالية للعقد إلى الفريق الثاني عند توقيع العقد، وبدفع نسبة (25%) عند توريد بروفيلات الألمنيوم إلى الموقع، وبدفع نسبة (25%) عند الانتهاء من نصب هيكل بروفيلات الألمنيوم في الموقع، وبدفع نسبة (15%) عند توريد الزجاج إلى الموقع وقبل التركيب، وبدفع كامل المبلغ المتبقي بنسبة (10%) بعد تركيب الزجاج وقبل التشطيب النهائي للسلكون والبرشر والكاب وما يرتبط بها من أعمال، حسب الفاتورة النهائية الصادرة من قبل الفريق الثاني وفقاً لذرعة واقع الحال.';
 const upfrontException = kind === 'commercial' ? '\nفي حال كانت القيمة الإجمالية للعقد أقل من (15,000,000) خمسة عشر مليون دينار عراقي تدفع الدفعة كاملة بنسبة (100%) عند توقيع العقد.' : '';
 return terms.map((section, index) => index === 2 ? {
  ...section,
  text: `يتعهد الفريق الأول بدفع قيمة العقد المبينة رقماً وكتابةً في هذا العقد، بالدينار العراقي، للفريق الثاني مقابل قيامه بالأعمال الموكلة إليه في العقد. مبلغ العقد قابل للنقصان أو الزيادة حسب الفاتورة النهائية للأعمال المنفذة.\n${paymentTerms}${upfrontException}\nيلتزم الفريق الثاني بتقديم كفالة مدتها عشرة سنوات بعد تسديد كافة المستحقات المالية وعند تسليم المشروع للفريق الأول وحسب شروط بطاقة الكفالة الخاصة بالفريق الثاني.\nالأسعار التفصيلية لكل بند أو وحدة موجودة في بيان الأقيسة والمواصفات المرفق بعقد الاتفاقية.`,
 } : { ...section });
}
