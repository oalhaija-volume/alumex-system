import { agreement2027PaymentSchedule, arabicDinarAmount, agreement2027Readiness, agreement2027SpecificationNotes } from './agreement2027Content';
import { AGREEMENT_2027_VERSION, agreementApprovalRoles, agreementSamples, type Agreement2027Fields, type Agreement2027Snapshot, type AgreementOpeningSpecification } from './agreement2027Types';
import type { QuoteSnapshot } from '../workflow/pricing';
import type { ContractSnapshot } from '../workflow/types';

const stringFields = [
 'clientLegalName','companyName','executingEntity','ownerName','ownerPhone','directPhone','whatsapp','email',
 'consultantName','consultantPhone','contractorName','contractorPhone','salesEngineerName','stateAtSigning','clientClassification',
 'handoverDate','handoverReceivedDate','projectApprovalDate','advancePaidDate','specialInstructions','agreedCommitments','followUpNotes','administrativeNotes',
 'companyRepresentativeName','companyRepresentativeTitle','companyRepresentativeDate','companyRepresentativeSignature',
] as const;
const dateFields = new Set(['handoverDate','handoverReceivedDate','projectApprovalDate','advancePaidDate','companyRepresentativeDate']);
const paragraphFields = new Set(['specialInstructions','agreedCommitments','followUpNotes','administrativeNotes']);
const signatureLimit = 220_000;

export function emptyAgreement2027Fields(): Agreement2027Fields {
 const approvals = Object.fromEntries(agreementApprovalRoles.map(role => [role, {name:'',date:'',signature:''}])) as Agreement2027Fields['approvals'];
 return {
  clientLegalName:'',companyName:'',executingEntity:'',ownerName:'',ownerPhone:'',directPhone:'',whatsapp:'',email:'',consultantName:'',consultantPhone:'',contractorName:'',contractorPhone:'',
  salesEngineerName:'',stateAtSigning:'',clientClassification:'',handoverDate:'',handoverReceivedDate:'',projectApprovalDate:'',advancePaidDate:'',
  samples:[],specialInstructions:'',agreedCommitments:'',followUpNotes:'',administrativeNotes:'',companyRepresentativeName:'',companyRepresentativeTitle:'',companyRepresentativeDate:'',companyRepresentativeSignature:'',
  approvals,phases:[{technicalMeetingDate:'',measurementReadyDate:'',installationReadyDate:'',notes:''}],
 };
}
function object(value: unknown, label: string): Record<string,unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Enter valid ${label}.`);
 return value as Record<string,unknown>;
}
function knownKeys(value: Record<string,unknown>, keys: readonly string[]) {
 if (Object.keys(value).some(key=>!keys.includes(key))) throw new Error('Contract details contain an unsupported field.');
}
function text(value: unknown, label: string, maximum=250): string {
 if (value === undefined) return '';
 if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Enter valid ${label}.`);
 return value.trim();
}
function date(value: unknown): string {
 const result=text(value,'contract date',10);
 if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result)||Number(result.slice(0,4))<1000||!Number.isFinite(new Date(`${result}T12:00:00Z`).getTime())||new Date(`${result}T12:00:00Z`).toISOString().slice(0,10)!==result)) throw new Error('Enter a valid contract date.');
 return result;
}
function signature(value: unknown): string {
 const result=text(value,'PNG signature',signatureLimit);
 if(result){
  if(!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(result)||!result.startsWith('data:image/png;base64,iVBORw0KGgo'))throw new Error('Upload a valid PNG signature.');
  let bytes:string;
  try{bytes=atob(result.slice(result.indexOf(',')+1));}catch{throw new Error('Upload a valid PNG signature.');}
  if(bytes.length<33||bytes.length>150*1024||bytes.slice(12,16)!=='IHDR')throw new Error('Upload a valid PNG signature.');
 }
 return result;
}
export function normalizeAgreement2027Fields(value: unknown): Agreement2027Fields {
 const source=object(value,'contract details');knownKeys(source,[...stringFields,'samples','approvals','phases']);
 const fields=emptyAgreement2027Fields();
 for(const key of stringFields) fields[key]=key==='companyRepresentativeSignature'?signature(source[key]):dateFields.has(key)?date(source[key]):text(source[key],'contract field',paragraphFields.has(key)?2000:250);
 if(source.samples!==undefined){
  if(!Array.isArray(source.samples)||source.samples.length>agreementSamples.length||source.samples.some(sample=>!agreementSamples.includes(sample)))throw new Error('Choose valid delivered samples.');
  fields.samples=[...new Set(source.samples)] as Agreement2027Fields['samples'];
 }
 if(source.approvals!==undefined){
  const approvals=object(source.approvals,'staff approvals');knownKeys(approvals,agreementApprovalRoles);
  for(const role of agreementApprovalRoles){
   if(approvals[role]===undefined)continue;
   const approval=object(approvals[role],'staff approval');knownKeys(approval,['name','date','signature']);
   fields.approvals[role]={name:text(approval.name,'approver name'),date:date(approval.date),signature:signature(approval.signature)};
  }
 }
 if(source.phases!==undefined){
  if(!Array.isArray(source.phases)||source.phases.length<1||source.phases.length>3)throw new Error('Enter one to three project phases.');
  fields.phases=source.phases.map(value=>{const phase=object(value,'project phase');knownKeys(phase,['technicalMeetingDate','measurementReadyDate','installationReadyDate','notes']);return{technicalMeetingDate:date(phase.technicalMeetingDate),measurementReadyDate:date(phase.measurementReadyDate),installationReadyDate:date(phase.installationReadyDate),notes:text(phase.notes,'phase notes',2000)};});
 }
 return fields;
}

export function isAgreement2027(contract: Pick<ContractSnapshot,'agreement2027'> | null | undefined): contract is ContractSnapshot & {agreement2027:Agreement2027Snapshot} {
 return contract?.agreement2027?.version===AGREEMENT_2027_VERSION;
}
export function buildAgreement2027Snapshot(quotation: Pick<QuoteSnapshot,'total'>,kind:'residential'|'commercial',fields: Agreement2027Fields,openingSpecifications: AgreementOpeningSpecification[]=[]): Agreement2027Snapshot {
 const normalized=normalizeAgreement2027Fields(fields);
 return {version:AGREEMENT_2027_VERSION,sourceDocument:'عقد اتفاق 2027.pdf',fields:normalized,total:quotation.total,amountInWords:arabicDinarAmount(quotation.total),paymentSchedule:agreement2027PaymentSchedule(quotation.total,kind),openingSpecifications:openingSpecifications.map(specification=>({...specification})),readiness:{measurement:[...agreement2027Readiness.measurement],installation:[...agreement2027Readiness.installation],notes:[...agreement2027Readiness.notes]},specificationNotes:[...agreement2027SpecificationNotes]};
}
