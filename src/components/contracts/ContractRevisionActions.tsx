"use client";
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { ContractDocumentRevision } from '@/lib/contracts/documentRevisions';
import { notifyWorkspaceChanged } from '@/lib/workflow/workspaceEvents';
import { SignaturePad } from './SignaturePad';
import { api, button, card, field, Notice, secondary } from '@/components/workflow/ui';

export function ContractRevisionActions({ documentRevision, canManage, onUpdated }: {
 documentRevision: ContractDocumentRevision;
 canManage: boolean;
 onUpdated: (revision: ContractDocumentRevision) => void;
}) {
 const { term, formatNumber, formatDateTime } = useI18n();
 const [approved, setApproved] = useState(false);
 const [method, setMethod] = useState<'digital' | 'hard_copy'>('digital');
 const [signer, setSigner] = useState('');
 const [signature, setSignature] = useState('');
 const [consent, setConsent] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const status = documentRevision.status;
 const superseded = !!documentRevision.superseded_at;
 async function submit(action: 'approve' | 'sign') {
  if (busy || !canManage || superseded || action === 'approve' && !approved || action === 'sign' && (!consent || !signer.trim() || method === 'digital' && !signature)) return;
  setBusy(true); setError('');
  try {
   const result = await api<{ documentRevision: ContractDocumentRevision }>(`/api/projects/${documentRevision.project_id}/contract-revisions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, id: documentRevision.id, revision: documentRevision.revision,
     ...(action === 'approve' ? { confirmed: true } : { evidence: { method, signer: signer.trim(), confirmed: consent, ...(method === 'digital' ? { signature } : {}) } }),
    }),
   });
   onUpdated(result.documentRevision);
   notifyWorkspaceChanged();
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update this contract revision.'); }
  finally { setBusy(false); }
 }
 return <section aria-label={term('Contract revision review')} className={`${card} space-y-4 print:hidden`}>
  <div className="flex flex-wrap items-center justify-between gap-3">
   <h2 className="font-semibold">{term('Contract revision {number}', { number: formatNumber(documentRevision.document_revision) })}</h2>
   <span className={`rounded-md px-3 py-2 text-sm font-semibold ${superseded ? 'bg-slate-100 text-slate-700' : status === 'signed' ? 'bg-green-50 text-green-800' : status === 'approved' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-900'}`}>{term(superseded ? 'Superseded revision' : status === 'signed' ? 'Signed' : status === 'approved' ? 'Approved · Awaiting signature' : 'Awaiting approval')}</span>
  </div>
  <p className="text-sm leading-6 text-slate-600">{term(documentRevision.revision_reason === 'client_name_correction' ? 'This revised copy corrects the client and project names. Prices and terms are retained.' : 'This revised copy adds the opening list and billable areas. The original contract, prices and terms are retained.')}</p>
  {superseded && <p className="text-sm font-medium text-slate-700">{term('This revision was replaced after a client name correction. Select the latest contract revision.')}</p>}
  {documentRevision.source_signed_at && <p className="text-sm text-slate-500">{term('Original signed on')}: {formatDateTime(documentRevision.source_signed_at)}</p>}
  {documentRevision.approved_at && <p className="text-sm text-slate-600">{term('Approved on')}: {formatDateTime(documentRevision.approved_at)}</p>}
  {documentRevision.signed_at && <p className="text-sm font-medium text-green-800">{term('Signed on')}: {formatDateTime(documentRevision.signed_at)} · {documentRevision.evidence?.signer}</p>}
  <Notice error={error}/>
  {canManage && !superseded && status === 'pending_approval' && <fieldset disabled={busy} className="space-y-4">
   <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} className="mt-1 min-h-5 min-w-5"/>{term('I confirm the client approved this revised contract.')}</label>
   <button type="button" disabled={busy || !approved} onClick={() => void submit('approve')} className={button}>{term(busy ? 'Saving…' : 'Approve revised contract')}</button>
  </fieldset>}
  {canManage && !superseded && status === 'approved' && <fieldset disabled={busy} className="space-y-4">
   <div className="flex flex-wrap gap-3">{(['digital', 'hard_copy'] as const).map(value => <button key={value} type="button" aria-pressed={method === value} onClick={() => { setMethod(value); setConsent(false); setSignature(''); setError(''); }} className={method === value ? button : secondary}>{term(value === 'digital' ? 'Sign digitally' : 'Client signed hard copy')}</button>)}</div>
   {method === 'digital' ? <SignaturePad signerName={signer} value={signature} onChange={setSignature} onSignerNameChange={setSigner} signerLabel={term('Client signer’s full name')} signerPlaceholder={term('Full name')} helpText={term('Use a finger or Apple Pencil to sign inside the box.')} ariaLabel={term('Client signature')} emptyMessage={term('Sign here')}/> : <label className="block text-sm">{term('Client signer’s full name')}<input maxLength={150} value={signer} onChange={event => setSigner(event.target.value)} className={field}/></label>}
   <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 min-h-5 min-w-5"/>{term(method === 'digital' ? 'I confirm that I have read and agree to the contract, including all openings, prices, and terms.' : 'I confirm the client has signed the complete printed contract shown above.')}</label>
   <button type="button" disabled={busy || !consent || !signer.trim() || method === 'digital' && !signature} onClick={() => void submit('sign')} className={button}>{term(busy ? 'Saving signed contract…' : 'Save revised contract signature')}</button>
  </fieldset>}
 </section>;
}
