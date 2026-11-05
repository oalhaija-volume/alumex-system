"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import { ProjectRecord } from './ProjectRecord';
/* eslint-disable @next/next/no-img-element -- Signatures are private inline PNG data, not remotely optimized images. */
import { useState } from 'react';
import Link from 'next/link';
import { SignaturePad } from '@/components/contracts/SignaturePad';
import type { ContractSnapshot, SalesFlow, SignedEvidence } from '@/lib/workflow/types';
import { DocumentHeader,DocumentParties,OpeningSchedule,ContractTerms,DocumentFooter,DocumentPaper } from './CommercialDocument';
import { api,button,card,field,Notice,secondary,useResource,Workspace } from './ui';

type ContractProject = {additional_openings_state?:string|null;sales_status?:string|null};
type ContractData = {flow:SalesFlow|null;project:ContractProject};

export function ContractWorkspace({projectId}:{projectId:string}) {
 const {term}=useI18n();
 const endpoint=`/api/sales-flow/${projectId}`;
 const {data,error,setError,setData,loading}=useResource<ContractData>(endpoint);
 const [notice,setNotice]=useState('');
 const flow=data?.flow,contract=flow?.contract;
 function replaceFlow(updated:SalesFlow){setData(current=>current?{...current,flow:updated}:current);}
 return <Workspace title={term('Client contract')} description={term('Review the complete contract, then sign digitally, upload a signed copy, or record that the client signed a hard copy.')}>
  <ProjectRecord projectId={projectId}/><Notice error={error}/>
  {notice&&<p role="status" className="mb-5 rounded-md bg-green-50 p-4 text-sm text-green-800 print:hidden">{term(notice)}</p>}
  {loading?<p>{term('Loading contract…')}</p>:!data||!flow||!contract?<div className={card}>
   <p>{term('Generate the contract from a client-approved quotation first.')}</p>
   <Link href={`/quotation/${projectId}`} className="mt-4 inline-block text-blue-600">{term('Open quotation →')}</Link>
  </div>:<ContractContent key={`${projectId}:${flow.revision}`} projectId={projectId} project={data.project} flow={flow} contract={contract} onFlow={replaceFlow} setError={setError} setNotice={setNotice}/>}
 </Workspace>;
}

// A new workflow revision remounts the editor so a previous signature, file or
// consent can never be reused after the contract's terms have changed.
function ContractContent({projectId,project,flow,contract,onFlow,setError,setNotice}:{
 projectId:string;project:ContractProject;flow:SalesFlow;contract:ContractSnapshot;
 onFlow:(updated:SalesFlow)=>void;setError:(message:string)=>void;setNotice:(message:string)=>void;
}) {
 const {term,formatDateTime}=useI18n();
 const endpoint=`/api/sales-flow/${projectId}`;
 const [signature,setSignature]=useState('');
 const [signer,setSigner]=useState('');
 const [consent,setConsent]=useState(false);
 const [method,setMethod]=useState<SignedEvidence['method']>('digital');
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [editingType,setEditingType]=useState(false);
 const [template,setTemplate]=useState(contract.template??'');
 const canChangeType=flow.stage==='contract'&&!flow.signed_at&&!flow.evidence&&!flow.accepted_at&&!flow.accepted_by&&project.sales_status==='contract_generated'&&!project.additional_openings_state;
 function changeMethod(next:SignedEvidence['method']){
  if(next===method)return;
  setMethod(next);setConsent(false);setError('');
 }

 async function changeContractType(){
  if(busy||!canChangeType||!['residential','commercial'].includes(template)||template===contract.template)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await api<{flow:SalesFlow}>(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'change-contract-template',revision:flow.revision,template,confirmed:true})});
   onFlow(result.flow);setNotice('Contract type changed. Review the new terms before signing.');
  }catch(cause){setError((cause as Error).message);}
  finally{setBusy(false);}
 }
 async function sign(){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   let init:RequestInit;
   if(method==='upload'){
    const form=new FormData();form.set('revision',String(flow.revision));form.set('signer',signer);form.set('consent',String(consent));if(file)form.set('file',file);
    init={method:'POST',body:form};
   }else init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sign',revision:flow.revision,method,signer,...(method==='digital'?{signature}:{}),consent})};
   const result=await api<{flow:SalesFlow}>(endpoint,init);onFlow(result.flow);
  }catch(cause){setError((cause as Error).message);}
  finally{setBusy(false);}
 }
 return <>
  <div className="mb-4 flex flex-wrap justify-end gap-3 print:hidden">
   {!flow.signed_at&&<Link href={`/quotation/${projectId}`} className={secondary}>{term('Revise quotation')}</Link>}
   {canChangeType&&<button type="button" disabled={busy} className={secondary} onClick={()=>{setEditingType(true);setError('');setNotice('');}}>{term('Change contract type')}</button>}
   <button type="button" disabled={busy} className={secondary} onClick={()=>window.print()}>{term('Print contract')}</button>
  </div>
  {canChangeType&&editingType&&<section aria-label={term('Change contract type')} className={`${card} mb-5 print:hidden`}>
   <h2 className="text-lg font-semibold">{term('Change contract type')}</h2>
   <p id="contract-type-help" className="mt-2 text-sm leading-6 text-slate-600">{term('Changing the contract type replaces its terms and payment schedule. Quotation prices remain unchanged. Review the new terms before signing.')}</p>
   <label className="mt-4 block text-sm font-medium">{term('Contract type')}
    <select disabled={busy} aria-label={term('Contract type')} aria-describedby="contract-type-help" value={template} onChange={event=>setTemplate(event.target.value as 'residential'|'commercial')} className={field}>
     {!contract.template&&<option value="">{term('Contract template')}</option>}
     <option value="residential">{term('Residential — uploaded Arabic terms')}</option>
     <option value="commercial">{term('Commercial — uploaded Arabic terms')}</option>
    </select>
   </label>
   <div className="mt-5 flex flex-wrap gap-3">
    <button type="button" disabled={busy||!template||template===contract.template} onClick={()=>void changeContractType()} className={button}>{busy?term('Saving…'):term('Save contract type')}</button>
    <button type="button" disabled={busy} onClick={()=>{setEditingType(false);setTemplate(contract.template??'');setError('');}} className={secondary}>{term('Cancel changes')}</button>
   </div>
  </section>}
  <DocumentPaper>
   <DocumentHeader kind="Contract" number={contract.number} createdAt={contract.createdAt}/>
   <DocumentParties client={contract.client} project={{...contract.project,branch:contract.branch??contract.project.branch}}/>
   <p className="document-note">{contract.template==='commercial'?term('Commercial supply & installation contract / عقد بيع وتركيب ألمنيوم — مشروع تجاري'):contract.template==='residential'?term('Residential supply & installation contract / عقد بيع وتركيب ألمنيوم — مشروع سكني'):term('Supply & installation contract / عقد بيع وتركيب ألمنيوم')}</p>
   <ContractTerms terms={contract.terms}/><OpeningSchedule quote={contract.quotation}/>
   <section className="mt-9 break-inside-avoid border-t border-slate-200 pt-6">
    <div className="document-company-signature"><h3>{term('For Alumex Experts / الطرف الأول')}</h3><p>{term('Authorized signature & company stamp')}</p><div/></div>
    <h3 className="font-semibold">{term('Client signature / الطرف الثاني')}</h3>
    {flow.signed_at?<>
     {flow.evidence?.method==='hard_copy'&&<p className="mt-2 text-sm font-semibold text-green-800">{term('Client signed hard copy')}</p>}
     <p className="mt-2 text-sm">{flow.evidence?.signer} · {formatDateTime(flow.signed_at)}</p>
     {flow.evidence?.signature&&<div className="mt-3"><img alt={term('Client signature')} src={flow.evidence.signature} className="max-h-40 max-w-full"/></div>}
     {flow.evidence?.method==='upload'&&<a href={`${endpoint}?download=signed`} className="mt-4 inline-block text-blue-600 print:hidden">{term('Download signed copy')}</a>}
    </>:<div className="mt-8 h-16 border-b border-slate-400"><p className="text-sm text-slate-400">{term('Name: ____________________ Date: ____________________')}</p></div>}
   </section>
   <DocumentFooter reference={contract.number}/>
  </DocumentPaper>
  {flow.signed_at?<p role="status" className="mt-6 rounded-md bg-green-50 p-5 text-green-800 print:hidden">{term('Signed contract saved. The project is now available in Operations.')}</p>:project.additional_openings_state?<p role="status" className="mt-6 rounded-md bg-amber-50 p-4 text-amber-900 print:hidden">{term('Complete the additional measurements and save a quotation revision before continuing.')}</p>:canChangeType&&<section className={`${card} mt-6 print:hidden`}>
   <h2 className="mb-5 text-xl font-semibold">{term('Complete signing')}</h2>
   <fieldset disabled={busy} className="min-w-0">
    <div className="mb-6 flex flex-wrap gap-3">
     <button type="button" aria-pressed={method==='digital'} className={method==='digital'?button:secondary} onClick={()=>changeMethod('digital')}>{term('Sign digitally')}</button>
     <button type="button" aria-pressed={method==='upload'} className={method==='upload'?button:secondary} onClick={()=>changeMethod('upload')}>{term('Upload signed hard copy')}</button>
     <button type="button" aria-pressed={method==='hard_copy'} className={method==='hard_copy'?button:secondary} onClick={()=>changeMethod('hard_copy')}>{term('Client signed hard copy')}</button>
    </div>
    {method==='digital'?<div className={busy?'pointer-events-none':''}><SignaturePad signerName={signer} value={signature} onChange={setSignature} onSignerNameChange={setSigner} signerLabel={term('Client signer’s full name')} signerPlaceholder={term('Full name')} helpText={term('Use a finger or Apple Pencil to sign inside the box.')} ariaLabel={term('Client signature')} emptyMessage={term('Sign here')}/></div>:<div className="space-y-4">
     {method==='hard_copy'&&<p className="text-sm leading-6 text-slate-600">{term('Record that the client signed a printed copy of this contract. No upload is required.')}</p>}
     <label className="block">{term('Client signer’s full name')}<input value={signer} maxLength={150} onChange={event=>setSigner(event.target.value)} className={field}/></label>
     {method==='upload'&&<label className="block cursor-pointer">{term('Signed PDF or image (up to 3 MB)')}<span className={`${field} flex items-center gap-3 focus-within:ring-2 focus-within:ring-blue-600`}><span>{file?.name??term('Choose file')}</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={event=>setFile(event.target.files?.[0]??null)} className="sr-only"/></span></label>}
    </div>}
    <label className="my-6 flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} className="mt-1"/>{method==='digital'?term('I confirm that I have read and agree to the contract, including all openings, prices, and terms.'):method==='upload'?term('I confirm this uploaded copy is the complete contract shown above and has been signed by the client.'):term('I confirm the client has signed the complete printed contract shown above.')}</label>
    <button type="button" disabled={busy||!consent||!signer.trim()||(method==='digital'&&!signature)||(method==='upload'&&!file)} onClick={()=>void sign()} className={button}>{busy?term('Saving signed contract…'):method==='hard_copy'?term('Record hard-copy signature & send to Operations'):term('Save signed contract & send to Operations')}</button>
   </fieldset>
  </section>}
 </>;
}
