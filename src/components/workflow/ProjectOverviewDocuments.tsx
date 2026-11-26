"use client";
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { SavedContractDocument } from '@/components/contracts/SavedContractDocument';
import { ContractRevisionActions } from '@/components/contracts/ContractRevisionActions';
import type { ContractDocumentRevision } from '@/lib/contracts/documentRevisions';
import { canPrepareQuotation } from '@/lib/auth/permissions';
import type { ProjectOverviewData } from '@/lib/workflow/projectOverview';
import { DocumentFooter, DocumentHeader, DocumentPaper, DocumentParties, OpeningSchedule } from './CommercialDocument';
import { card, Notice, secondary } from './ui';

export function ProjectDocuments({ data, kind, onRevisionUpdated }: { data: ProjectOverviewData; kind: 'quotation' | 'contract'; onRevisionUpdated: (revision: ContractDocumentRevision) => void }) {
 const { term, formatNumber, formatDateTime } = useI18n();
 const [selectedVersion, setVersion] = useState<string | null>(null);
 const version = selectedVersion ?? (kind === 'contract' && data.documentRevisions?.length ? `document-${data.documentRevisions[0].id}` : 'current');
 const [printing, setPrinting] = useState(false);
 const [error, setError] = useState('');
 const revision = version === 'current' ? null : data.history.find(row => String(row.version) === version);
 const documentRevision = version.startsWith('document-') ? data.documentRevisions?.find(row => `document-${row.id}` === version) : null;
 const quote = version === 'current' ? data.flow?.quotation : revision?.quotation;
 const contract = documentRevision?.contract ?? (version === 'current' ? data.flow?.contract : revision?.contract);
 const present = kind === 'quotation' ? quote : contract;
 const history = data.history.filter(row => kind === 'quotation' || row.contract);
 async function printDocument() {
  setPrinting(true); setError('');
  try { await document.fonts.ready; await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.commercial-document img')).map(image => image.decode())); window.print(); }
  catch { setError('Unable to prepare this document for printing.'); }
  finally { setPrinting(false); }
 }
 return <div className="space-y-5">
  <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
   <label className="block text-sm font-medium">{term(kind === 'quotation' ? 'Quotation version' : 'Contract version')}
    <select aria-label={term(kind === 'quotation' ? 'Quotation version' : 'Contract version')} value={version} onChange={event => { setVersion(event.target.value); setError(''); }} className="mt-2 block min-h-11 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2">
     <option value="current">{kind === 'contract' && data.documentRevisions?.length ? term('Original contract') : term('Revision {number} · Current', { number: formatNumber((kind === 'contract' ? data.flow?.contract?.quotation.version : data.flow?.quotation.version) ?? 1) })}</option>
     {kind === 'contract' && data.documentRevisions?.map(row => <option key={row.id} value={`document-${row.id}`}>{term('Contract revision {number}', { number: formatNumber(row.document_revision) })} · {term(row.superseded_at ? 'Superseded revision' : row.status === 'signed' ? 'Signed' : row.status === 'approved' ? 'Approved · Awaiting signature' : 'Awaiting approval')}</option>)}
     {history.map(row => <option key={row.version} value={row.version}>{term('Revision {number} · Superseded', { number: formatNumber(row.version) })}</option>)}
    </select>
   </label>
   <div className="flex flex-wrap gap-3">
    {kind === 'contract' && version === 'current' && data.signedCopyAvailable && <a href={`/api/projects/${data.project.id}?download=signed`} className={`${secondary} inline-flex items-center`}>{term('Download signed copy')}</a>}
    {present && <button type="button" disabled={printing} onClick={() => void printDocument()} className={secondary}>{term(printing ? 'Preparing print…' : kind === 'quotation' ? 'Print quotation' : 'Print contract')}</button>}
   </div>
  </div>
  <Notice error={error}/>
  {documentRevision && <ContractRevisionActions key={`${documentRevision.id}-${documentRevision.revision}`} documentRevision={documentRevision} canManage={canPrepareQuotation(data.actor.role)} onUpdated={onRevisionUpdated}/>}
  {kind === 'contract' && version === 'current' && data.flow?.signed_at && <p className="text-sm text-green-800 print:hidden">{term('Signed on')}: {formatDateTime(data.flow.signed_at)} · {data.flow.evidence?.signer}</p>}
  {!present ? <div className={card}><p className="text-sm text-slate-500">{term(kind === 'quotation' ? 'No quotation has been saved for this project yet.' : 'No contract has been generated for this project yet.')}</p></div> : kind === 'quotation' && quote ? <DocumentPaper>
   <DocumentHeader kind="Quotation" number={`QT-${data.project.project_number}-${quote.version ?? 1}`} createdAt={quote.createdAt}/>
   <DocumentParties client={{ name: data.client?.name ?? data.project.client_name ?? '—', mobile: data.client?.mobile ?? null }} project={{ name: data.project.project_name, number: data.project.project_number, address: data.project.address, branch: data.project.branch, governorate: data.project.governorate }}/>
   <OpeningSchedule quote={quote} areaBasis="billable"/><DocumentFooter reference={`QT-${data.project.project_number}-${quote.version ?? 1}`}/>
  </DocumentPaper> : contract ? <SavedContractDocument contract={contract} signedAt={documentRevision ? documentRevision.signed_at : version === 'current' ? data.flow?.signed_at : null} evidence={documentRevision ? documentRevision.evidence : version === 'current' ? data.flow?.evidence : null} documentRevision={documentRevision}/> : null}
 </div>;
}

