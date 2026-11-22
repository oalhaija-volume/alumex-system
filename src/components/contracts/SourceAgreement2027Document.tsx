"use client";
/* eslint-disable @next/next/no-img-element -- Original PDF vector stationery and private saved signatures must print without image transformation. */
import type { CSSProperties, ReactNode } from 'react';
import type { ContractSnapshot, SignedEvidence } from '@/lib/workflow/types';
import type { AgreementApprovalRole } from '@/lib/contracts/agreement2027Types';
import { contractDeliverySummary } from '@/lib/contracts/deliveryDuration';
import type { Charge } from '@/lib/workflow/pricing';
import { alumexSystemLabel } from '@/lib/workflow/alumexModels';
import { selectedAgreement2027Products } from '@/lib/contracts/agreement2027Products';
import { Agreement2027SelectedProducts, selectedSpecificationPages, type SelectedSpecificationPage } from './Agreement2027SelectedProducts';
import { CompactAgreement2027Document } from './CompactAgreement2027Document';
import layout from '../../../public/contracts/agreement-2027/template-layout.json';
import styles from './SourceAgreement2027Document.module.css';

type Box = number[];
type TemplateField = { key: string; rect: Box };
const fieldsByPage: Record<string, TemplateField[]> = layout.fields;
const pricesByPage: Record<string, { key: string; label: string; rect: Box }[]> = layout.prices;
const number = (amount: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount);
const date = (input?: string | null) => {
 if (!input) return '';
 const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(input) ? input + 'T12:00:00+03:00' : input);
 return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed) : '';
};
const labels: Record<string, string> = { ready: 'جاهز', not_ready: 'غير جاهز', new_lead: 'مشروع جديد', ready_for_quotation: 'جاهز لعرض السعر', quotation_in_progress: 'عرض سعر قيد الإعداد', quotation_approved: 'عرض سعر معتمد', contract_generated: 'عقد مُعدّ', individual: 'فرد', company: 'شركة', corporate: 'شركة' };
function position(rect: Box): CSSProperties {
 return { left: rect[0] / layout.pageSize.width * 100 + '%', top: rect[1] / layout.pageSize.height * 100 + '%', width: (rect[2] - rect[0]) / layout.pageSize.width * 100 + '%', height: (rect[3] - rect[1]) / layout.pageSize.height * 100 + '%' };
}
function Field({ field, text, children }: { field: TemplateField; text?: string; children?: ReactNode }) {
 if (!text && !children) return null;
 const width = field.rect[2] - field.rect[0], height = field.rect[3] - field.rect[1];
 // Fit the stored value inside its original PDF cell, without ellipses or
 // substituting a shortened value in the signed/printed document.
 const maxSize = Math.min(8, height / 1.2);
 const estimatedArea = Math.max(1, (text?.length ?? 1) * 0.58);
 const singleLine = /^(?:contractNumber|contractAmount$|rate-|deliveryWorkingDays$)/.test(field.key);
 let fontSize = singleLine ? Math.min(maxSize, width / Math.max(1, (text?.length ?? 1) * 0.65)) : Math.min(maxSize, Math.sqrt(width * height / estimatedArea / 1.15));
 if (!singleLine && text) {
  for (let fit = 0; fit < 16; fit++) {
   const lines = text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length * 0.65 * fontSize / width)), 0);
   if (lines * fontSize * 1.1 <= height) break;
   fontSize *= 0.92;
  }
 }
 return <div data-agreement-field={field.key} className={styles.field} style={{ ...position(field.rect), fontSize: fontSize / layout.pageSize.width * 100 + 'cqw', ...(singleLine ? { whiteSpace: 'nowrap', overflowWrap: 'normal' } : {}) }} dir="auto">{children ?? text}</div>;
}
function Tick({ rect, checked, label, type }: { rect: Box; checked: boolean; label: string; type?: string }) {
 return <span role="checkbox" aria-checked={checked} aria-label={label} data-contract-type={type} className={styles.tick} style={position(rect)}>{checked ? '✓' : ''}</span>;
}

function priceKey(name: string): string {
 const text = name.toLowerCase().replace(/alumex\s*a16\b/g, 'alumex 16').replace(/pro\s*\+/g, 'plus').replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
 if (/photocell/.test(text)) return /gezz?e/.test(text) ? 'photo-cell-geze' : /(?:door)?ex$/.test(text) ? 'photo-cell-ex' : 'photo-cell';
 if (text.includes('alumexcurtainwall')) return 'alumex-curtain-wall-cw60';
 if (text.includes('alumexskylight')) return 'alumex-skylight-cw60';
 if (text.includes('theaddresscurtainwall')) return 'the-address-curtain-wall';
 if (text.includes('theaddressah')) return 'the-address-ah650-660-688';
 if (text.includes('theaddressasa18')) return 'the-address-as-a18';
 if (text.includes('theaddressasa15')) return 'the-address-as-a15';
 const models: Record<string, string> = { alumex16: 'alumex-16', alumex16pro: 'alumex-16-pro', alumex16plus: 'alumex-16-plus', alumex4500: 'alumex-4500', alumex4500pro: 'alumex-4500-pro', alumex4500louver: 'alumex-4500-louver', alumexpushout: 'alumex-push-out', alumexswingdoor: 'alumex-swing-door' };
 if (models[text]) return models[text];
 if (/tempered|سيكوريت|مقسى/.test(text)) return /double|لوحين/.test(text) ? 'tempered-glass-double' : 'tempered-glass-single';
 if (/lowe/.test(text)) return 'low-e-glass';
 if (/mirror|عاكس/.test(text)) return 'mirror-glass';
 if (/georgian/.test(text)) return 'georgian-bar';
 if (/tilt|laval/.test(text)) return 'turn-and-tilt';
 if (/subframe|coverframe/.test(text)) return 'sub-frame';
 if (/arch|تقويس/.test(text)) return 'arch';
 return text;
}
function quotedRates(contract: ContractSnapshot): Map<string, number[]> {
 const charges: Charge[] = [...contract.quotation.lines.flatMap(line => [{ ...line.system, name: alumexSystemLabel(line.system.name, line.systemModel) }, ...(line.glass ? [line.glass] : []), ...line.extras]), ...(contract.quotation.additionalItems ?? []).flatMap(item => [item, ...(item.extras ?? [])])];
 const rates = new Map<string, number[]>();
 for (const charge of charges) {
  const key = priceKey(charge.name), saved = rates.get(key) ?? [];
  if (Number.isFinite(charge.rate) && !saved.includes(charge.rate)) saved.push(charge.rate);
  rates.set(key, saved);
 }
 return rates;
}

export function SourceAgreement2027Document({ contract, signedAt, evidence }: { contract: ContractSnapshot; signedAt?: string | null; evidence?: SignedEvidence | null }) {
 const agreement = contract.agreement2027;
 if (!agreement || (contract.template !== 'residential' && contract.template !== 'commercial')) return null;
 const kind = contract.template, fields = agreement.fields, advance = agreement.paymentSchedule[0];
 const productsOnly = agreement.selectedProductsOnly === true;
 const products = productsOnly ? selectedAgreement2027Products(contract.quotation, agreement.openingSpecifications) : [];
 const pages: { sourcePage: number; specification?: SelectedSpecificationPage }[] = productsOnly
  ? [{ sourcePage: 1 }, { sourcePage: 2 }, ...selectedSpecificationPages(products).map(specification => ({ sourcePage: specification.sourcePage, specification })), { sourcePage: 5 }, { sourcePage: 6 }, { sourcePage: 7 }]
  : [1, 2, 3, 4, 5, 6, 7].map(sourcePage => ({ sourcePage }));
 const duration = contractDeliverySummary(contract.terms);
 const deliveryClause = contract.terms.find(section => /^مدة\s+تنفيذ\s+المشروع/u.test(section.text))?.text ?? '';
 const delivery = deliveryClause.match(/هي\s*\(\s*([0-9٠-٩]+)\s*\)\s*([^،.\n]*?)\s+يوم/u);
 const directPhone = productsOnly ? fields.directPhone : fields.directPhone || contract.client.mobile;
 const contacts = [
  directPhone ? 'اتصال: ' + directPhone : '',
  fields.whatsapp ? 'واتساب: ' + fields.whatsapp : '',
  fields.email ? fields.email : '',
 ].filter(Boolean).join(' · ');
 const weekday = Number.isFinite(new Date(contract.createdAt).getTime()) ? new Intl.DateTimeFormat('ar-IQ', { timeZone: 'Asia/Baghdad', weekday: 'long' }).format(new Date(contract.createdAt)) : '';
 const values: Record<string, string> = {
  projectName: contract.project.name + ' (' + contract.project.number + ')', contractNumber: contract.number, handoffDate: date(fields.handoverDate),
  contractDate: date(contract.createdAt), siteConditionAtSigning: labels[fields.stateAtSigning] ?? fields.stateAtSigning,
  projectDuration: duration, salesEngineerName: fields.salesEngineerName, customerClassification: labels[fields.clientClassification] ?? fields.clientClassification,
  cityArea: contract.project.address ?? '', consultantName: fields.consultantName, consultantPhone: fields.consultantPhone,
  ownerName: fields.ownerName, ownerPhone: fields.ownerPhone, contractValue: number(agreement.total) + ' د.ع',
  contractorName: fields.contractorName, contractorPhone: fields.contractorPhone, advancePaymentPercent: advance ? number(advance.percent) + '%' : '',
  advancePaymentAmount: advance ? number(advance.amount) + ' د.ع' : '', owningEntityName: fields.companyName, advancePaymentDate: date(fields.advancePaidDate),
  projectInstructions: fields.specialInstructions, agreedCommitments: fields.agreedCommitments, specialFollowUpNotes: fields.followUpNotes,
  projectManagerName: fields.approvals.projectsManager.name, handoffReceiptDate: date(fields.handoverReceivedDate),
  projectEngineerName: fields.approvals.projectEngineer.name, projectApprovalDate: date(fields.projectApprovalDate),
  administrativeRecommendations: fields.administrativeNotes, firstPartyName: productsOnly ? fields.clientLegalName : fields.clientLegalName || contract.client.name,
  executingEntityName: fields.executingEntity, projectAddress: contract.project.address ?? '', officialContacts: contacts,
  contractWeekday: weekday, contractAmount: number(agreement.total), contractAmountWords: agreement.amountInWords.replace(/^فقط\s*/, '').replace(/\s*لا غير$/, '').replace(/ديناران عراقيان/u, 'اثنان').replace(/\s*دينار(?:اً|ان)?\s*عراقي(?:اً|ان)?/u, '').replace(/\s*دنانير عراقية/u, ''),
  deliveryWorkingDays: delivery?.[1] ?? '', deliveryWorkingDaysWords: delivery?.[2] ?? '',
  companyRepresentativeName: fields.companyRepresentativeName, companyRepresentativeRole: fields.companyRepresentativeTitle,
 };
 const approvalKeys: [string, AgreementApprovalRole][] = [['SalesEngineer', 'salesEngineer'], ['SalesManager', 'salesManager'], ['OperationsManager', 'operationsManager'], ['ProjectManager', 'projectsManager'], ['ProjectEngineer', 'projectEngineer']];
 const signatures: Record<string, string> = { salesEngineerSignature: fields.approvals.salesEngineer.signature };
 for (const [key, role] of approvalKeys) {
  values['approval' + key + 'Name'] = fields.approvals[role].name;
  values['approval' + key + 'Date'] = date(fields.approvals[role].date);
  signatures['approval' + key + 'Signature'] = fields.approvals[role].signature;
 }
 for (let phase = 0; phase < 3; phase++) {
  const saved = fields.phases[phase];
  for (const key of ['technicalMeetingDate', 'measurementReadyDate', 'installationReadyDate'] as const) values['phase-' + phase + '-' + key] = date(saved?.[key]);
 }
 // The PDF has one notes column beside the three phase dates. Preserve each
 // phase's own saved note, in phase order, in that original notes cell.
 values.technicalMeetingNotes = fields.phases.map((phase, index) => phase.notes ? 'المرحلة ' + (index + 1) + ': ' + phase.notes : '').filter(Boolean).join('\n');
 const quoted = quotedRates(contract);
 const names = (productsOnly ? products.map(product => product.name) : [...contract.quotation.lines.map(line => line.system.name), ...(contract.quotation.additionalItems ?? []).map(item => item.name)]).join(' ').toLowerCase();
 const contents: Record<string, boolean> = {
  roller: productsOnly ? /roller shutter|اباجور|أباجور/i.test(names) : contract.quotation.lines.some(line => line.extras.some(extra => /roller shutter|اباجور|أباجور/i.test(extra.name))),
  curtainWall: /curtain wall|كيرتن/.test(names), skylight: /skylight|سكاي/.test(names), louver: /louver|لوفر/.test(names),
  sliding: contract.quotation.lines.some(line => line.opening.opening_direction === 'Sliding'),
  hinged: contract.quotation.lines.some(line => line.opening.opening_direction === 'Hinged' && line.opening.opening_type !== 'Louver'),
 };
 const samples: Record<string, boolean> = { aluminium: fields.samples.includes('aluminum'), glass: fields.samples.includes('glass'), roller: fields.samples.includes('rollerShutter'), curtainSection: fields.samples.includes('curtainWall') };
 const clauseTranscript = (start: number, end: number) => <div className={styles.transcript} data-agreement-section="terms">{contract.terms.slice(start - 1, end).map((clause, index) => <section key={start + index} data-agreement-clause={start + index}><h3>{clause.title}</h3><p>{clause.text}</p></section>)}</div>;
 function renderHeader() {
  return fieldsByPage.header.map(field => <Field key={'header-' + field.key} field={field} text={values[field.key]} />);
 }
 function renderFields(sourcePage: number, keys?: readonly string[], offsetY = 0) {
  return (fieldsByPage[String(sourcePage)] ?? []).filter(field => !keys || keys.includes(field.key)).map(original => {
   const field = { ...original, rect: original.rect.map((coordinate, index) => index === 1 || index === 3 ? coordinate + offsetY : coordinate) };
   if (field.key === 'clientSignature' || field.key === 'companySignature') {
    const company = field.key === 'companySignature', signature = company ? fields.companyRepresentativeSignature : evidence?.signature;
    const signer = company ? fields.companyRepresentativeName : evidence?.signer, signatureDate = date(company ? fields.companyRepresentativeDate : signedAt);
    return <Field key={field.key} field={field}><div className={styles.signature} data-agreement-company-signature={company || undefined}>{signature && <img src={signature} alt={company ? 'توقيع ممثل الشركة' : 'توقيع العميل'} />}{(signer || signatureDate) && <p>{signer} <bdi dir="ltr">{signatureDate}</bdi></p>}</div></Field>;
   }
   if (field.key in signatures) return signatures[field.key] ? <Field key={field.key} field={field}><img className={styles.approvalSignature} src={signatures[field.key]} alt={field.key} /></Field> : null;
   return <Field key={field.key} field={field} text={field.key === 'contractDate' && sourcePage === 1 ? date(signedAt) : values[field.key]} />;
  });
 }
 function renderCoverChecks() {
  return <>
   {Object.entries(layout.checkboxes.projectType).map(([type, rect]) => <Tick key={type} type={type} rect={rect} checked={type === kind} label={type === 'commercial' ? 'تجاري' : type === 'residential' ? 'سكن خاص' : 'مشروع'} />)}
   {Object.entries(layout.checkboxes.samples).map(([key, rect]) => <Tick key={key} rect={rect} checked={samples[key]} label={'عينة ' + key} />)}
   {Object.entries(layout.checkboxes.contents).map(([key, rect]) => <Tick key={key} rect={rect} checked={contents[key]} label={'محتويات المشروع ' + key} />)}
  </>;
 }
 if (productsOnly && agreement.compactLayout === true) return <CompactAgreement2027Document contract={contract} products={products} renderHeader={renderHeader} renderFields={renderFields} renderCoverChecks={renderCoverChecks} />;
 return <div lang="ar" dir="rtl" className={styles.document} data-agreement-version={agreement.version} data-agreement-layout="source-pdf-2027" data-source-document={agreement.sourceDocument}>
  {pages.map(({ sourcePage: page, specification }, pageIndex) => {
   const asset = specification ? layout.layout.stationery[String(page) as '3' | '4'] : layout.assets.find(item => item.page === page && (!item.kind || item.kind === kind))!;
   const screenFile = (asset as { screenFile?: string }).screenFile || asset.file;
   const section = page === 1 ? 'handover' : page === 2 ? 'parties' : page === 3 || page === 4 ? 'specifications' : page === 7 ? 'annex' : undefined;
   return <section key={pageIndex} data-agreement-page={pageIndex + 1} data-agreement-template-page={page} data-agreement-section={section} aria-label={'عقد اتفاق 2027 — الصفحة ' + (pageIndex + 1)} className={styles.page}>
    <img data-agreement-artwork="screen" className={styles.artwork + ' ' + styles.screenArtwork} src={'/contracts/agreement-2027/' + screenFile} alt="" aria-hidden="true" width={layout.pageSize.width} height={layout.pageSize.height} decoding="sync" />
    <img data-agreement-artwork="print" className={styles.artwork + ' ' + styles.printArtwork} src={'/contracts/agreement-2027/' + asset.file} alt="" aria-hidden="true" width={layout.pageSize.width} height={layout.pageSize.height} decoding="sync" />
    <div className={styles.transcript}>{asset.sourceText}</div>
    {specification && <Agreement2027SelectedProducts page={specification} />}
    {renderHeader()}{renderFields(page)}
    {page === 1 && renderCoverChecks()}
    {page === 2 && <><section data-agreement-section="payments" data-payment-schedule={kind} className={styles.transcript}>
     <h3>{kind === 'commercial' ? 'المشاريع التجارية' : 'المشاريع السكنية'}</h3><p>{contract.terms[2]?.text}</p>
     {agreement.paymentSchedule.map(stage => <p key={stage.id} data-payment-stage={stage.id}>{stage.label} {stage.percent}% {number(stage.amount)} د.ع {stage.trigger}</p>)}
    </section>{clauseTranscript(1, 3)}</>}
    {(!productsOnly ? pricesByPage[String(page)] ?? [] : []).map(slot => {
     const rates = quoted.get(slot.key), text = rates?.length ? rates.map(number).join(' / ') : '—';
     return <Field key={slot.key} field={{ key: 'rate-' + slot.key, rect: slot.rect }} text={text} />;
    })}
    {page === 3 && (!productsOnly || pageIndex === 2) && <>{clauseTranscript(4, 4)}{!productsOnly && <div className={styles.transcript} aria-label="المواصفات المعتمدة للمشروع">{contract.quotation.lines.map(line => {
     const spec = agreement.openingSpecifications.find(item => item.openingId === line.opening.id);
     return <p key={line.opening.id}>{alumexSystemLabel(line.system.name, line.systemModel)} {number(line.system.rate)} د.ع {spec?.technicalDescription} {spec?.aluminumColor} {spec?.glassColor} {spec?.bottomFrame} {spec?.notes}</p>;
    })}</div>}</>}
    {page === 5 && clauseTranscript(5, 14)}
    {page === 6 && clauseTranscript(15, 19)}
    {page === 7 && <div className={styles.transcript}>{[...agreement.readiness.measurement, ...agreement.readiness.installation, ...agreement.readiness.notes].map((note, index) => <p key={index}>{note}</p>)}</div>}
   </section>;
  })}
 </div>;
}
