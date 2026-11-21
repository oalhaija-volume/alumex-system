"use client";
/* eslint-disable @next/next/no-img-element -- Actual company/team signatures are private PNGs saved with the contract. */
import type { ReactNode } from 'react';
import type { ContractSnapshot } from '@/lib/workflow/types';
import { contractDeliverySummary } from '@/lib/contracts/deliveryDuration';
import { alumexSystemLabel } from '@/lib/workflow/alumexModels';
import { agreementApprovalRoles, type Agreement2027Snapshot, type AgreementApprovalRole } from '@/lib/contracts/agreement2027Types';
import { OpeningSchedule } from '@/components/workflow/CommercialDocument';

const approvalLabels: Record<AgreementApprovalRole, string> = { salesEngineer: 'مهندس المبيعات', salesManager: 'مدير المبيعات', operationsManager: 'مدير العمليات', projectsManager: 'مدير المشاريع', projectEngineer: 'مهندس المشروع' };
const sampleLabels = { aluminum: 'عينة ألمنيوم', glass: 'عينة زجاج', rollerShutter: 'عينة أباجور', curtainWall: 'عينة سكشن كيرتن' };
const money = (amount: number) => `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount)} د.ع`;
const value = (text?: string | null) => text?.trim() || '—';
function date(text?: string | null) {
 if (!text) return '—';
 const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00+03:00` : text);
 return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('ar-IQ', { timeZone: 'Asia/Baghdad', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed) : '—';
}
const stateLabels: Record<string, string> = { ready: 'جاهز', not_ready: 'غير جاهز', new_lead: 'مشروع جديد', ready_for_quotation: 'جاهز لعرض السعر', quotation_in_progress: 'عرض سعر قيد الإعداد', quotation_approved: 'عرض سعر معتمد', contract_generated: 'عقد مُعدّ', individual: 'فرد', company: 'شركة', corporate: 'شركة' };
function InfoGrid({ items }: { items: [string, ReactNode][] }) {
 return <dl className="grid min-w-0 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 sm:grid-cols-2">{items.map(([label, content]) => <div key={label} className="min-w-0 bg-white p-3 print:break-inside-avoid"><dt className="text-xs font-semibold text-slate-600">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{typeof content === 'string' ? value(content) : content}</dd></div>)}</dl>;
}
function Heading({ children }: { children: ReactNode }) { return <h3 className="mb-4 border-b-2 border-slate-300 pb-2 text-base font-semibold text-slate-900 print:break-after-avoid">{children}</h3>; }
function Notes({ label, text }: { label: string; text: string }) { return <div className="rounded border border-slate-200 p-3 print:break-inside-avoid"><h4 className="text-xs font-semibold text-slate-600">{label}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7">{value(text)}</p></div>; }

function Handover({ contract, agreement, signedAt }: { contract: ContractSnapshot; agreement: Agreement2027Snapshot; signedAt?: string | null }) {
 const fields = agreement.fields;
 const names = [...contract.quotation.lines.map(line => line.system.name), ...(contract.quotation.additionalItems ?? []).map(item => item.name)].join(' ').toLowerCase();
 const contents: [string, boolean][] = [
  ['سلايد', contract.quotation.lines.some(line => line.opening.opening_direction === 'Sliding')],
  ['فصال', contract.quotation.lines.some(line => line.opening.opening_direction === 'Hinged' && line.opening.opening_type !== 'Louver')],
  ['سكاي لايت', /skylight|سكاي/.test(names)], ['لوفر', /louver|louvers|لوفر/.test(names)],
  ['كيرتن', /curtain wall|كيرتن/.test(names)], ['أباجور', contract.quotation.lines.some(line => line.extras.some(extra => /roller shutter|اباجور|أباجور/i.test(extra.name)))],
 ];
 return <section data-agreement-section="handover" className="space-y-5">
  <Heading>قسم المبيعات — بيانات المشروع</Heading>
  <InfoGrid items={[
   ['اسم المشروع', contract.project.name], ['رقم عقد المشروع', contract.number], ['تاريخ التحويل', date(fields.handoverDate)],
   ['تاريخ توقيع العقد', date(signedAt)], ['حالة المشروع عند التوقيع', stateLabels[fields.stateAtSigning] ?? fields.stateAtSigning],
   ['مدة المشروع', contractDeliverySummary(contract.terms)], ['مهندس المبيعات', fields.salesEngineerName], ['تصنيف العميل', stateLabels[fields.clientClassification] ?? fields.clientClassification],
  ]} />
  <Heading>معلومات المشروع التفصيلية</Heading>
  <InfoGrid items={[
   ['نوع المشروع', contract.template === 'commercial' ? 'تجاري / مشروع' : 'سكن خاص'], ['المدينة / المنطقة', contract.project.address],
   ['اسم المالك', fields.ownerName], ['رقم هاتف المالك', fields.ownerPhone], ['اسم الاستشاري إن وجد', fields.consultantName], ['رقم هاتف الاستشاري', fields.consultantPhone],
   ['اسم المقاول', fields.contractorName], ['رقم هاتف المقاول', fields.contractorPhone], ['اسم الشركة / الجهة المالكة', fields.companyName],
   ['قيمة العقد', money(agreement.total)], ['نسبة الدفعة المقدمة', `${agreement.paymentSchedule[0]?.percent ?? 0}%`],
   ['قيمة الدفعة الأولية', money(agreement.paymentSchedule[0]?.amount ?? 0)], ['تاريخ تسديد الدفعة الأولية', date(fields.advancePaidDate)],
  ]} />
  <Heading>العينات والمحتويات</Heading>
  <div className="space-y-3 rounded border border-slate-200 p-3"><p className="font-semibold">عينات تم تسليمها للزبون</p><p className="flex flex-wrap gap-x-5 gap-y-2">{(Object.entries(sampleLabels) as [keyof typeof sampleLabels, string][]).map(([key, label]) => <span key={key}>{fields.samples.includes(key) ? '☑' : '☐'} {label}</span>)}</p><p className="font-semibold">محتويات المشروع حسب عرض السعر المعتمد</p><p className="flex flex-wrap gap-x-5 gap-y-2">{contents.map(([label, included]) => <span key={label}>{included ? '☑' : '☐'} {label}</span>)}</p></div>
  <div className="space-y-3"><Notes label="التوجيهات الخاصة بالمشروع" text={fields.specialInstructions} /><Notes label="الالتزامات والوعود التي تم الاتفاق عليها مع العميل" text={fields.agreedCommitments} /><Notes label="ملاحظات خاصة يجب متابعتها" text={fields.followUpNotes} /></div>
  <InfoGrid items={[
   ['مدير المشاريع', fields.approvals.projectsManager.name], ['تاريخ استلام التحويل', date(fields.handoverReceivedDate)],
   ['مهندس المشروع', fields.approvals.projectEngineer.name], ['تاريخ اعتماد المشروع', date(fields.projectApprovalDate)],
  ]} />
  <Heading>قسم المشاريع — الأسماء والتواقيع والاعتمادات</Heading>
  <div className="max-w-full overflow-x-auto print:overflow-visible"><table className="w-full min-w-[570px] table-fixed border-collapse text-xs print:min-w-0"><thead><tr>{agreementApprovalRoles.map(role => <th key={role} className="border border-slate-300 bg-slate-100 p-2 text-right">{approvalLabels[role]}</th>)}</tr></thead><tbody><tr>{agreementApprovalRoles.map(role => <td key={role} className="break-words border border-slate-300 p-2 align-top">{value(fields.approvals[role].name)}</td>)}</tr><tr>{agreementApprovalRoles.map(role => <td key={role} className="h-16 border border-slate-300 p-2 align-top">{fields.approvals[role].signature ? <img src={fields.approvals[role].signature} alt={`توقيع ${approvalLabels[role]}`} className="max-h-16 max-w-full object-contain" /> : 'التوقيع: __________________'}</td>)}</tr><tr>{agreementApprovalRoles.map(role => <td key={role} className="border border-slate-300 p-2">{date(fields.approvals[role].date)}</td>)}</tr></tbody></table></div>
  <Notes label="توصيات إدارية خاصة" text={fields.administrativeNotes} />
 </section>;
}

function Parties({ contract, agreement }: { contract: ContractSnapshot; agreement: Agreement2027Snapshot }) {
 const fields = agreement.fields;
 const created = new Date(contract.createdAt);
 const weekday = Number.isFinite(created.getTime()) ? new Intl.DateTimeFormat('ar-IQ', { timeZone: 'Asia/Baghdad', weekday: 'long' }).format(created) : '';
 return <section data-agreement-section="parties" className="space-y-4">
  <Heading>عقد اتفاقية — تجهيز وتركيب ألمنيوم وزجاج</Heading>
  <div className="grid gap-4 sm:grid-cols-2"><section className="min-w-0 space-y-2 rounded border border-slate-200 p-4"><h4 className="font-semibold">الفريق الأول: {value(fields.clientLegalName || contract.client.name)}</h4><p>اسم الشركة أو الجهة المنفذة للمشروع: {value(fields.executingEntity)}</p><p>عنوان المشروع: {value(contract.project.address)}</p><p>وسائل تواصل معتمدة للمراسلات الرسمية:</p><p>اتصال مباشر: <bdi dir="ltr">{value(fields.directPhone || contract.client.mobile)}</bdi></p><p>واتساب: <bdi dir="ltr">{value(fields.whatsapp)}</bdi></p><p className="break-words [overflow-wrap:anywhere]">البريد الإلكتروني: <bdi dir="ltr">{value(fields.email)}</bdi></p></section><section className="space-y-2 rounded border border-slate-200 p-4"><h4 className="font-semibold">الفريق الثاني: شركة خبراء الومكس لصناعة وتجارة الألمنيوم المحدودة</h4><p lang="en" dir="ltr">ALUMINIUM EXPERTS</p><p>العراق — بغداد / فرع الرصافة / كرادة / شارع مجمع المشن — فرع الكرخ / القادسية / قرب ساحة النسور</p><p>الرقم الموحد: <bdi dir="ltr">6772</bdi></p><p>البريد الإلكتروني: <bdi dir="ltr">INFO@ALUMEXIQ.COM</bdi></p></section></div>
  <p className="leading-8">تم الاتفاق بين الفريقين في يوم {weekday} الموافق {date(contract.createdAt)}، وهما في الحالة المعتبرة شرعاً وقانوناً، على قيام الفريق الثاني بتنفيذ أعمال الألمنيوم للفريق الأول، وذلك وفق الشروط والأحكام التالية:</p>
 </section>;
}

function Payments({ agreement }: { agreement: Agreement2027Snapshot }) {
 return <section data-agreement-section="payments" className="my-5 space-y-4 rounded border border-slate-300 p-3 sm:p-4">
  <p className="font-semibold">قيمة العقد حسب عرض السعر المعتمد: <bdi>{money(agreement.total)}</bdi></p><p className="leading-8">{agreement.amountInWords}</p>
  <div className="max-w-full overflow-x-auto print:overflow-visible"><table className="w-full min-w-[500px] table-fixed border-collapse text-xs print:min-w-0"><caption className="mb-2 text-right text-sm font-semibold">جدول الدفعات</caption><thead><tr>{['الدفعة', 'النسبة', 'المبلغ — دينار عراقي', 'موعد الاستحقاق'].map(label => <th key={label} className="border border-slate-300 bg-slate-100 p-2 text-right">{label}</th>)}</tr></thead><tbody>{agreement.paymentSchedule.map(stage => <tr key={stage.id} data-payment-stage={stage.id}><th scope="row" className="border border-slate-300 p-2 text-right font-medium">{stage.label}</th><td className="border border-slate-300 p-2"><bdi>{stage.percent}%</bdi></td><td className="border border-slate-300 p-2"><bdi>{money(stage.amount)}</bdi></td><td className="border border-slate-300 p-2 leading-6">{stage.trigger}</td></tr>)}</tbody></table></div>
  <p className="text-xs leading-7">مبلغ العقد قابل للنقصان أو الزيادة وفق الفاتورة النهائية للأعمال المنفذة وذرعة واقع الحال، حسب أحكام العقد.</p>
 </section>;
}

function Specifications({ contract, agreement }: { contract: ContractSnapshot; agreement: Agreement2027Snapshot }) {
 const specs = new Map(agreement.openingSpecifications.map(spec => [spec.openingId, spec]));
 return <section data-agreement-section="specifications" className="my-5 space-y-4">
  <p className="leading-8">تُعتمد المقاطع والمنتجات والمواصفات المختارة والأسعار الفعلية في عرض السعر المعتمد المرفق بهذا العقد، بما في ذلك جميع الإضافات المشمولة فيه.</p>
  <OpeningSchedule quote={contract.quotation} areaBasis="billable" />
  {!!agreement.openingSpecifications.length && <section><h4 className="mb-3 font-semibold">تفاصيل المواصفات والمخططات لكل فقرة</h4><div className="grid gap-3 sm:grid-cols-2">{contract.quotation.lines.map((line, index) => {
   const spec = specs.get(line.opening.id);
   return <section key={line.opening.id} className="min-w-0 space-y-2 rounded border border-slate-200 p-3 text-xs leading-7 print:break-inside-avoid"><h5 className="font-semibold">الفقرة {index + 1}: <bdi dir="ltr">{alumexSystemLabel(line.system.name,line.systemModel)}</bdi></h5>{spec?.technicalDescription && <p className="whitespace-pre-wrap">{spec.technicalDescription}</p>}<p>لون الألمنيوم: {value(spec?.aluminumColor)}</p><p>لون الزجاج: {value(spec?.glassColor)}</p><p>الإطار الأرضي / عتب الباب: {value(spec?.bottomFrame)}</p><p className="whitespace-pre-wrap">ملاحظات: {value(spec?.notes)}</p></section>;
  })}</div></section>}
  <ul className="list-inside list-disc space-y-2 text-sm leading-8">{agreement.specificationNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>
 </section>;
}

function Annex({ agreement }: { agreement: Agreement2027Snapshot }) {
 return <section data-agreement-section="annex" className="space-y-5 border-t-2 border-slate-300 pt-6">
  <Heading>ملحق رقم (1)</Heading>
  <p className="leading-8">فيما يلي شروط جاهزية الموقع للقياسات التفصيلية والتركيب والتي يجب الالتزام بها من قبل الفريق الأول:</p>
  <div className="grid gap-5 sm:grid-cols-2"><section><h4 className="mb-3 font-semibold">شروط جاهزية الوحدة للقياسات التفصيلية</h4><ul className="list-inside list-disc space-y-2 leading-8">{agreement.readiness.measurement.map((note, index) => <li key={index}>{note}</li>)}</ul></section><section><h4 className="mb-3 font-semibold">شروط جاهزية الوحدة للتركيب</h4><ul className="list-inside list-disc space-y-2 leading-8">{agreement.readiness.installation.map((note, index) => <li key={index}>{note}</li>)}</ul></section></div>
  <p className="leading-8">نرجو تحديد المواعيد المبينة أدناه، والتي تؤثر على جدولة المشروع لدى الفريق الثاني وبالتالي على مواعيد التركيب.</p>
  <div className="max-w-full overflow-x-auto print:overflow-visible"><table className="w-full min-w-[520px] table-fixed border-collapse text-xs print:min-w-0"><caption className="mb-2 text-right text-sm font-semibold">المواعيد المطلوبة من العميل</caption><thead><tr><th className="border border-slate-300 bg-slate-100 p-2 text-right">الموعد</th>{agreement.fields.phases.map((_, index) => <th key={index} className="border border-slate-300 bg-slate-100 p-2 text-right">المرحلة {index + 1}</th>)}</tr></thead><tbody>{([
   ['technicalMeetingDate', 'اجتماع تحديد المتطلبات الفنية للمشروع'], ['measurementReadyDate', 'جاهزية الموقع لأخذ القياس التفصيلي'], ['installationReadyDate', 'جاهزية الموقع للتركيب'],
  ] as const).map(([key, label]) => <tr key={key}><th scope="row" className="border border-slate-300 p-2 text-right font-medium">{label}</th>{agreement.fields.phases.map((phase, index) => <td key={index} className="border border-slate-300 p-2"><bdi>{date(phase[key])}</bdi></td>)}</tr>)}<tr><th scope="row" className="border border-slate-300 p-2 text-right font-medium">ملاحظات عامة</th>{agreement.fields.phases.map((phase, index) => <td key={index} className="whitespace-pre-wrap break-words border border-slate-300 p-2">{value(phase.notes)}</td>)}</tr></tbody></table></div>
  <ol className="list-inside list-decimal space-y-3 leading-8">{agreement.readiness.notes.map((note, index) => <li key={index}>{note}</li>)}</ol>
 </section>;
}

export function Agreement2027Document({ contract, signedAt }: { contract: ContractSnapshot; signedAt?: string | null }) {
 const agreement = contract.agreement2027;
 if (!agreement) return null;
 return <div lang="ar" dir="rtl" data-agreement-version={agreement.version} className="space-y-8 pt-6 [overflow-wrap:anywhere]">
  <Handover contract={contract} agreement={agreement} signedAt={signedAt} />
  <Parties contract={contract} agreement={agreement} />
  <section data-agreement-section="terms" className="document-terms">{contract.terms.map((section, index) => <section key={index} data-agreement-clause={index + 1}><h4>{section.title}</h4>{section.text.split('\n').filter(Boolean).map((paragraph, current) => <p key={current} dir="rtl">{paragraph}</p>)}{index === 2 && <Payments agreement={agreement} />}{index === 3 && <Specifications contract={contract} agreement={agreement} />}</section>)}</section>
  <Annex agreement={agreement} />
 </div>;
}
