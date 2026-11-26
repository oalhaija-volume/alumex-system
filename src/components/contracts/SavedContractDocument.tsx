"use client";
/* eslint-disable @next/next/no-img-element -- Signatures are saved private inline images. */
import { useI18n } from '@/components/i18n/I18nProvider';
import type { ContractDocumentRevision } from '@/lib/contracts/documentRevisions';
import type { ContractSnapshot, SignedEvidence } from '@/lib/workflow/types';
import { ContractTerms, DocumentFooter, DocumentHeader, DocumentPaper, DocumentParties, OpeningSchedule } from '@/components/workflow/CommercialDocument';
import { Agreement2027Document } from './Agreement2027Document';

export function SavedContractDocument({ contract, signedAt, evidence, documentRevision }: { contract: ContractSnapshot; signedAt?: string | null; evidence?: SignedEvidence | null; documentRevision?: ContractDocumentRevision | null }) {
 const { term, formatDateTime } = useI18n();
 const agreement = contract.agreement2027;
 const source = agreement?.documentLayout === 'source-pdf-2027' && (contract.template === 'residential' || contract.template === 'commercial');
 return <DocumentPaper>
  {documentRevision && <p data-contract-revision-status={documentRevision.superseded_at ? 'superseded' : documentRevision.status} className="mb-4 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700 print:fixed print:inset-x-0 print:bottom-0 print:z-50 print:m-0 print:bg-white/90 print:text-[9px]">{term('Contract revision {number}', { number: documentRevision.document_revision })} · {term(documentRevision.superseded_at ? 'Superseded revision' : documentRevision.status === 'signed' ? 'Signed' : documentRevision.status === 'approved' ? 'Approved · Awaiting signature' : 'Revised copy · Awaiting approval and new signature')}</p>}
  {!source && <DocumentHeader kind="Contract" number={contract.number} createdAt={contract.createdAt}/>}
  {agreement ? <Agreement2027Document contract={contract} signedAt={signedAt} evidence={evidence}/> : <>
   <DocumentParties client={contract.client} project={{ ...contract.project, branch: contract.branch ?? contract.project.branch }}/>
   <ContractTerms terms={contract.terms}/><OpeningSchedule quote={contract.quotation} areaBasis="billable"/>
  </>}
  {!source && <section className="mt-8 border-t border-slate-200 pt-5">
   <h3 className="font-semibold">{term('Client signature')}</h3>
   {signedAt && <p className="mt-2 text-sm">{evidence?.signer} · {formatDateTime(signedAt)}</p>}
   {evidence?.method === 'hard_copy' && <p className="mt-2 text-sm">{term('Client signed hard copy')}</p>}
   {evidence?.signature && <img src={evidence.signature} alt={term('Client signature')} className="mt-3 max-h-40 max-w-full"/>}
   {agreement && <div className="mt-5"><h3 className="font-semibold">{term('Authorized signature & company stamp')}</h3><p>{agreement.fields.companyRepresentativeName}</p><p>{agreement.fields.companyRepresentativeTitle}</p><p>{agreement.fields.companyRepresentativeDate}</p>{agreement.fields.companyRepresentativeSignature && <img src={agreement.fields.companyRepresentativeSignature} alt={term('Authorized signature & company stamp')} className="mt-3 max-h-32 max-w-full"/>}</div>}
  </section>}
  {!source && <DocumentFooter reference={contract.number}/>}
 </DocumentPaper>;
}
