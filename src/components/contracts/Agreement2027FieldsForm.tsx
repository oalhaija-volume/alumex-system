"use client";
/* eslint-disable @next/next/no-img-element -- Private, user-supplied PNG signatures are embedded in the contract snapshot. */
import { useId, useState, type ReactNode } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { agreementApprovalRoles, agreementSamples, type Agreement2027Fields, type AgreementApprovalRole, type AgreementPhase } from '@/lib/contracts/agreement2027Types';
import { field, secondary } from '@/components/workflow/ui';

const approvalLabels: Record<AgreementApprovalRole, [string, string]> = {
 salesEngineer: ['Sales engineer', 'مهندس المبيعات'], salesManager: ['Sales manager', 'مدير المبيعات'],
 operationsManager: ['Operations manager', 'مدير العمليات'], projectsManager: ['Projects manager', 'مدير المشاريع'], projectEngineer: ['Project engineer', 'مهندس المشروع'],
};
const sampleLabels = { aluminum: ['Aluminum', 'ألمنيوم'], glass: ['Glass', 'زجاج'], rollerShutter: ['Roller shutter', 'أباجور'], curtainWall: ['Curtain Wall section', 'سكشن كيرتن'] };
const emptyPhase = (): AgreementPhase => ({ technicalMeetingDate: '', measurementReadyDate: '', installationReadyDate: '', notes: '' });

type TextKey = { [K in keyof Agreement2027Fields]: Agreement2027Fields[K] extends string ? K : never }[keyof Agreement2027Fields];

function SignatureUpload({ name, label, value, onChange, disabled }: { name: string; label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
 const { locale } = useI18n();
 const [error, setError] = useState('');
 async function select(file?: File) {
  setError('');
  if (!file) return;
  if (file.type !== 'image/png' || file.size > 150 * 1024) {
   setError(locale === 'ar' ? 'اختر توقيعاً بصيغة PNG بحجم لا يتجاوز 150 كيلوبايت.' : 'Choose a PNG signature up to 150 KB.');
   return;
  }
  const reader = new FileReader();
  reader.onload = () => { if (typeof reader.result === 'string') onChange(reader.result); };
  reader.onerror = () => setError(locale === 'ar' ? 'تعذرت قراءة التوقيع.' : 'Unable to read the signature.');
  reader.readAsDataURL(file);
 }
 return <div className="min-w-0 space-y-2">
  <label className="block text-sm font-medium">{label}<input name={name} type="file" accept="image/png" disabled={disabled} onChange={event => void select(event.target.files?.[0])} className={`${field} file:me-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm`} /></label>
  {value && <div className="flex flex-wrap items-center gap-3"><img src={value} alt={label} className="max-h-20 max-w-full rounded border border-slate-200 bg-white p-2" /><button type="button" disabled={disabled} onClick={() => onChange('')} className={secondary}>{locale === 'ar' ? 'مسح التوقيع' : 'Clear signature'}</button></div>}
  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}

export function Agreement2027FieldsForm({ value, onChange, disabled = false }: { value: Agreement2027Fields; onChange: (value: Agreement2027Fields) => void; disabled?: boolean }) {
 const { locale } = useI18n();
 const id = useId();
 const text = (en: string, ar: string) => locale === 'ar' ? ar : en;
 function update<K extends keyof Agreement2027Fields>(key: K, next: Agreement2027Fields[K]) { onChange({ ...value, [key]: next }); }
 function input(key: TextKey, en: string, ar: string, type: 'text' | 'tel' | 'email' | 'date' = 'text') {
  return <label key={key} className="block min-w-0 text-sm font-medium" htmlFor={`${id}-${key}`}>{text(en, ar)}<input id={`${id}-${key}`} name={`agreement-${key}`} type={type} value={value[key]} disabled={disabled} maxLength={type === 'date' ? undefined : 250} onChange={event => update(key, event.target.value)} className={field} dir={type === 'tel' || type === 'email' || type === 'date' ? 'ltr' : 'auto'} /></label>;
 }
 function notes(key: TextKey, en: string, ar: string) {
  return <label key={key} className="block text-sm font-medium" htmlFor={`${id}-${key}`}>{text(en, ar)}<textarea id={`${id}-${key}`} name={`agreement-${key}`} rows={3} maxLength={2000} value={value[key]} disabled={disabled} onChange={event => update(key, event.target.value)} className={field} dir="auto" /></label>;
 }
 function section(en: string, ar: string, children: ReactNode, open = false) {
  return <details className="rounded-md border border-slate-200 bg-slate-50" open={open || undefined}><summary className="min-h-12 cursor-pointer px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-blue-600">{text(en, ar)}</summary><div className="space-y-5 border-t border-slate-200 p-4 sm:p-5">{children}</div></details>;
 }
 function phase(index: number, patch: Partial<AgreementPhase>) { update('phases', value.phases.map((item, current) => current === index ? { ...item, ...patch } : item)); }
 return <div className="space-y-4" data-agreement-fields>
  <p className="text-sm leading-6 text-slate-600">{text('Known project details are filled automatically. Complete the fields that apply; prices and payment amounts come from the approved quotation.', 'تُعبّأ بيانات المشروع المتوفرة تلقائياً. أكمل الحقول التي تنطبق على المشروع؛ تُستمد الأسعار ومبالغ الدفعات من عرض السعر المعتمد.')}</p>
  {section('Client and project contacts', 'بيانات العميل وجهات الاتصال', <div className="grid gap-5 sm:grid-cols-2">
   {input('clientLegalName', 'Client legal name / first party', 'الاسم القانوني للعميل / الفريق الأول')}
   {input('companyName', 'Owning company / entity', 'الشركة / الجهة المالكة')}
   {input('executingEntity', 'Project executing company / entity', 'الشركة أو الجهة المنفذة للمشروع')}
   {input('ownerName', 'Owner name', 'اسم المالك')}{input('ownerPhone', 'Owner phone', 'هاتف المالك', 'tel')}
   {input('directPhone', 'Direct contact phone', 'رقم الاتصال المباشر', 'tel')}{input('whatsapp', 'WhatsApp', 'رقم واتساب', 'tel')}{input('email', 'Email', 'البريد الإلكتروني', 'email')}
   {input('consultantName', 'Consultant name', 'اسم الاستشاري')}{input('consultantPhone', 'Consultant phone', 'هاتف الاستشاري', 'tel')}
   {input('contractorName', 'Contractor name', 'اسم المقاول')}{input('contractorPhone', 'Contractor phone', 'هاتف المقاول', 'tel')}
  </div>, true)}
  {section('Project handover', 'تحويل المشروع', <>
   <div className="grid gap-5 sm:grid-cols-2">
    {input('salesEngineerName', 'Sales engineer', 'مهندس المبيعات')}{input('stateAtSigning', 'Project condition at signing', 'حالة المشروع عند التوقيع')}
    {input('clientClassification', 'Client classification', 'تصنيف العميل')}{input('handoverDate', 'Handover date', 'تاريخ التحويل', 'date')}
    {input('handoverReceivedDate', 'Handover received date', 'تاريخ استلام التحويل', 'date')}{input('projectApprovalDate', 'Project approval date', 'تاريخ اعتماد المشروع', 'date')}
    {input('advancePaidDate', 'Initial payment received date', 'تاريخ تسديد الدفعة الأولية', 'date')}
   </div>
   <fieldset><legend className="text-sm font-medium">{text('Samples delivered to the client', 'العينات المسلّمة للعميل')}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{agreementSamples.map(sample => <label key={sample} className="flex min-h-12 items-center gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm"><input name={`agreement-sample-${sample}`} type="checkbox" checked={value.samples.includes(sample)} disabled={disabled} onChange={event => update('samples', event.target.checked ? [...value.samples, sample] : value.samples.filter(item => item !== sample))} />{sampleLabels[sample][locale === 'ar' ? 1 : 0]}</label>)}</div></fieldset>
   {notes('specialInstructions', 'Project instructions', 'التوجيهات الخاصة بالمشروع')}{notes('agreedCommitments', 'Agreed commitments and promises', 'الالتزامات والوعود المتفق عليها مع العميل')}
   {notes('followUpNotes', 'Follow-up notes', 'ملاحظات خاصة يجب متابعتها')}{notes('administrativeNotes', 'Administrative recommendations', 'توصيات إدارية خاصة')}
  </>)}
  {section('Annex — customer-agreed phase dates', 'الملحق — مواعيد المراحل المتفق عليها مع العميل', <>
   <p className="text-sm leading-6 text-slate-600">{text('Record the agreed dates for each stage. Villas may have up to three stages; small projects use one stage.', 'سجّل المواعيد المتفق عليها لكل مرحلة. الحد الأقصى لمشاريع الفلل ثلاث مراحل، وللمشاريع الصغيرة مرحلة واحدة.')}</p>
   {value.phases.map((item, index) => <fieldset key={index} className="min-w-0 space-y-4 rounded-md border border-slate-200 bg-white p-4"><legend className="px-2 text-sm font-semibold">{text(`Stage ${index + 1}`, `المرحلة ${index + 1}`)}</legend><div className="grid gap-4 sm:grid-cols-3">{([
    ['technicalMeetingDate', 'Technical requirements meeting', 'اجتماع المتطلبات الفنية'], ['measurementReadyDate', 'Site ready for detailed measurements', 'جاهزية الموقع للقياس التفصيلي'], ['installationReadyDate', 'Site ready for installation', 'جاهزية الموقع للتركيب'],
   ] as const).map(([key, en, ar]) => <label key={key} className="block min-w-0 text-sm font-medium">{text(en, ar)}<input name={`agreement-phase-${index}-${key}`} type="date" value={item[key]} disabled={disabled} onChange={event => phase(index, { [key]: event.target.value })} className={field} /></label>)}</div><label className="block text-sm font-medium">{text('General notes', 'ملاحظات عامة')}<textarea name={`agreement-phase-${index}-notes`} rows={2} maxLength={2000} value={item.notes} disabled={disabled} onChange={event => phase(index, { notes: event.target.value })} className={field} dir="auto" /></label>{value.phases.length > 1 && <button type="button" disabled={disabled} onClick={() => update('phases', value.phases.filter((_, current) => current !== index))} className={secondary}>{text('Remove stage', 'إزالة المرحلة')}</button>}</fieldset>)}
   {value.phases.length < 3 && <button type="button" disabled={disabled} onClick={() => update('phases', [...value.phases, emptyPhase()])} className={secondary}>{text('Add stage', 'إضافة مرحلة')}</button>}
  </>)}
  {section('Company representative', 'ممثل الشركة', <>
   <div className="grid gap-5 sm:grid-cols-2">{input('companyRepresentativeName', 'Authorized employee name', 'اسم الموظف المخوّل')}{input('companyRepresentativeTitle', 'Job title', 'المسمى الوظيفي')}{input('companyRepresentativeDate', 'Company signature date', 'تاريخ توقيع ممثل الشركة', 'date')}</div>
   <SignatureUpload name="agreement-companyRepresentativeSignature" label={text('Company representative signature (optional PNG)', 'توقيع ممثل الشركة (PNG اختياري)')} value={value.companyRepresentativeSignature} disabled={disabled} onChange={signature => update('companyRepresentativeSignature', signature)} />
  </>)}
  {section('Internal team approvals', 'اعتمادات الفريق الداخلي', <>
   <p className="text-sm leading-6 text-slate-600">{text('Record approvals actually given. Signatures may also be completed on the printed contract.', 'سجّل الموافقات الفعلية فقط. ويمكن استكمال التواقيع على النسخة المطبوعة من العقد.')}</p>
   {agreementApprovalRoles.map(role => <fieldset key={role} className="min-w-0 space-y-4 rounded-md border border-slate-200 bg-white p-4"><legend className="px-2 font-semibold">{approvalLabels[role][locale === 'ar' ? 1 : 0]}</legend><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">{text('Name', 'الاسم')}<input name={`agreement-approval-${role}-name`} value={value.approvals[role].name} disabled={disabled} maxLength={250} onChange={event => update('approvals', { ...value.approvals, [role]: { ...value.approvals[role], name: event.target.value } })} className={field} dir="auto" /></label><label className="text-sm font-medium">{text('Approval date', 'تاريخ الاعتماد')}<input name={`agreement-approval-${role}-date`} type="date" value={value.approvals[role].date} disabled={disabled} onChange={event => update('approvals', { ...value.approvals, [role]: { ...value.approvals[role], date: event.target.value } })} className={field} /></label></div><SignatureUpload name={`agreement-approval-${role}-signature`} label={text('Approval signature (optional PNG)', 'توقيع الاعتماد (PNG اختياري)')} value={value.approvals[role].signature} disabled={disabled} onChange={signature => update('approvals', { ...value.approvals, [role]: { ...value.approvals[role], signature } })} /></fieldset>)}
  </>)}
 </div>;
}
