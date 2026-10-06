"use client";
import Link from 'next/link';
import { useState } from 'react';
import { defaultSystem,systemOptions,additionalOptions,priceQuotation,money,type CatalogItem,type MeasuredOpening,type OpeningChoice,type AdditionalChoice } from '@/lib/workflow/pricing';
import { quotationOpenings } from '@/lib/workflow/quotationOpenings';
import type { RegistrationOpening } from '@/lib/measurements/registrationOpening';
import type { QuotationRevision,SalesFlow } from '@/lib/workflow/types';
import { ProjectRecord } from './ProjectRecord';
import { QuotationOpeningForm } from './QuotationOpeningForm';
import { DocumentHeader,DocumentParties,OpeningSchedule,DocumentFooter,DocumentPaper } from './CommercialDocument';
import { api,button,card,field,Notice,secondary,useResource,Workspace } from './ui';

type QuoteData={project:{project_name:string;project_number:string;address:string;sales_status:string};client:{name:string;mobile:string;client_type?:string};openings:MeasuredOpening[];catalog:CatalogItem[];flow:SalesFlow|null;history:QuotationRevision[]};
const quantityLabel=(unit?:string)=>unit==='sqm'?'Area (m²)':unit==='meter'?'Length (m)':'Quantity';
const rateLabel=(p:CatalogItem)=>p.unit_price>0?`${money(p.unit_price)} / ${p.unit}`:'Price required';

function QuoteEditor({data,projectId,reload}:{data:QuoteData;projectId:string;reload:()=>Promise<void>}) {
 const {catalog,flow}=data;
 const [newOpenings,setNewOpenings]=useState<RegistrationOpening[]>([]);
 const openings=quotationOpenings(data.openings,newOpenings);
 const [choices,setChoices]=useState<OpeningChoice[]>(()=>data.openings.map(o=>{
  const saved=flow?.quotation.lines.find(l=>l.opening.id===o.id);
  return {openingId:o.id,systemId:saved?.system.id??defaultSystem(o,catalog)?.id??'',glassId:saved?.glass?.id??'',extras:saved?.extras.map(e=>({id:e.id,quantity:e.quantity}))??[]};
 }));
 const [additionalItems,setAdditionalItems]=useState<AdditionalChoice[]>(()=>flow?.quotation.additionalItems?.map(item=>({id:item.id,quantity:item.quantity}))??[]);
 const [editing,setEditing]=useState(!flow);
 const [addingOpening,setAddingOpening]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [approved,setApproved]=useState(false);
 const [replaceContract,setReplaceContract]=useState(false);
 const [viewVersion,setViewVersion]=useState('current');
 const [template,setTemplate]=useState<'residential'|'commercial'>(['company','corporate'].includes(data.client.client_type??'')?'commercial':'residential');
 const canEdit=!flow||(!flow.signed_at&&['quotation','approved','contract'].includes(flow.stage));
 const archived=viewVersion==='current'?undefined:data.history?.find(h=>String(h.version)===viewVersion);
 const shown=archived?.quotation??flow?.quotation;
 const reference=`QT-${data.project.project_number}-R${archived?.version??shown?.version??1}`;
 let draftTotal:number|undefined;
 let pricingError='';
 if(editing){try{draftTotal=priceQuotation(openings,choices,catalog,'preview',additionalItems).total;}catch(e){pricingError=(e as Error).message;}}
 function edit(index:number,patch:Partial<OpeningChoice>){setChoices(c=>c.map((v,i)=>i===index?{...v,...patch}:v));}
 function addOpening(opening:RegistrationOpening){
  const measured=quotationOpenings([], [opening])[0];
  setNewOpenings(rows=>[...rows,opening]);
  setChoices(rows=>[...rows,{openingId:opening.id,systemId:defaultSystem(measured,catalog)?.id??'',glassId:'',extras:[]}]);
  setAddingOpening(false);
 }
 async function act(action:string){
  if(busy)return;
  setBusy(true);setError('');
  try{
   await api(`/api/sales-flow/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,choices,additionalItems,newOpenings,revision:flow?.revision??0,confirmed:approved,template,replaceUnsignedContract:replaceContract})});
   await reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function cancel(){setBusy(true);setError('');try{await reload();setEditing(false);setAddingOpening(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <>
  <Notice error={error}/>
  {editing&&canEdit?<fieldset disabled={busy} className="min-w-0 space-y-5 print:hidden">
   <div className="rounded-md bg-blue-50 p-4 text-sm leading-6 text-blue-900">
    <p>{flow?`Editing revision ${flow.quotation.version??1}. Saving creates revision ${(flow.quotation.version??1)+1} and requires new client approval.`:'Alumex is selected by default. Choose the specifications requested by the client.'}</p>
    <p>All items are recalculated using current catalog rates. Review the new total before saving.</p>
   </div>
   {openings.map((opening,index)=>{
    const choice=choices[index];
    const isNew=newOpenings.some(o=>o.id===opening.id);
    return <section key={opening.id} className={card} aria-label={`Opening ${index+1}`}>
     <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Opening {index+1} · {opening.opening_type} {opening.opening_direction}</h2>{isNew&&<button type="button" className="min-h-11 px-3 text-sm text-red-700" onClick={()=>{setNewOpenings(rows=>rows.filter(o=>o.id!==opening.id));setChoices(rows=>rows.filter(c=>c.openingId!==opening.id));}}>Remove new opening</button>}</div>
     <p className="mt-2 text-sm text-slate-500">Floor {opening.floor} · {opening.room} · {opening.width} × {opening.height} cm{isNew?' · Not saved yet':''}</p>
     <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm">System / product<select aria-label="System / product" value={choice.systemId} onChange={e=>edit(index,{systemId:e.target.value})} className={field}><option value="">Choose system</option>{systemOptions(opening,catalog).map(p=><option key={p.id} value={p.id}>{p.name} · {rateLabel(p)}</option>)}</select></label>
      <label className="text-sm">Glass<select aria-label="Glass" value={choice.glassId} onChange={e=>edit(index,{glassId:e.target.value,extras:choice.extras.filter(x=>x.id!==e.target.value)})} className={field}><option value="">Standard glass included</option>{catalog.filter(p=>/glass/i.test(p.name)).map(p=><option key={p.id} value={p.id}>{p.name} · {rateLabel(p)}</option>)}</select></label>
     </div>
     <div className="mt-5"><label className="text-sm">Add an extra<select aria-label="Add an extra" value="" onChange={e=>{if(e.target.value)edit(index,{extras:[...choice.extras,{id:e.target.value,quantity:1}]});}} className={field}><option value="">Choose add-on</option>{catalog.filter(p=>(p.category==='addon'||p.category==='service')&&p.id!==choice.systemId&&p.id!==choice.glassId&&!choice.extras.some(e=>e.id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name} · {rateLabel(p)}</option>)}</select></label>
      {choice.extras.map(extra=>{const p=catalog.find(p=>p.id===extra.id);return <div key={extra.id} className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3">
       <span className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">{p?.name??'Unavailable item'}{p?.unit==='sqm'&&<span className="block text-xs text-slate-500">Uses this opening’s area</span>}</span>
       {p?.unit!=='sqm'&&<label className="text-xs">{quantityLabel(p?.unit)}<input aria-label={`${p?.name} quantity`} type="number" min="0.01" max="1000000" step="0.01" value={extra.quantity||''} className={`${field} max-w-28`} onChange={e=>edit(index,{extras:choice.extras.map(x=>x.id===extra.id?{...x,quantity:Number(e.target.value)}:x)})}/></label>}
       <button type="button" className="min-h-11 px-3 text-sm text-red-700" onClick={()=>edit(index,{extras:choice.extras.filter(x=>x.id!==extra.id)})}>Remove</button>
      </div>;})}
     </div>
    </section>;
   })}
   {addingOpening?<QuotationOpeningForm onAdd={addOpening} onCancel={()=>setAddingOpening(false)}/>:<button type="button" disabled={newOpenings.length>=100} onClick={()=>setAddingOpening(true)} className={secondary}>+ Add opening</button>}
   <section className={card}>
    <h2 className="font-semibold">Additional products & services</h2><p className="mt-2 text-sm text-slate-500">Items for the whole project. Enter the quantity, area or length for each item.</p>
    <label className="mt-4 block text-sm">Add product or service<select aria-label="Add product or service" className={field} value="" onChange={e=>{if(e.target.value)setAdditionalItems(items=>[...items,{id:e.target.value,quantity:1}]);}}><option value="">Choose from the price catalog</option>{additionalOptions(catalog).filter(p=>!additionalItems.some(item=>item.id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name} · {rateLabel(p)}</option>)}</select></label>
    {additionalItems.map(item=>{const p=catalog.find(p=>p.id===item.id);return <div key={item.id} className="mt-4 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"><div className="w-full min-w-0 self-center sm:w-auto sm:flex-1"><p className="text-sm font-medium">{p?.name??'Unavailable item'}</p>{p&&<p className="mt-1 text-xs text-slate-500">{rateLabel(p)}</p>}</div><label className="text-xs">{quantityLabel(p?.unit)}<input aria-label={`${p?.name} project quantity`} className={`${field} max-w-28`} type="number" min="0.01" max="1000000" step="0.01" value={item.quantity||''} onChange={e=>setAdditionalItems(items=>items.map(x=>x.id===item.id?{...x,quantity:Number(e.target.value)}:x))}/></label><button type="button" aria-label={`Remove ${p?.name}`} className="min-h-12 px-3 text-sm text-red-700" onClick={()=>setAdditionalItems(items=>items.filter(x=>x.id!==item.id))}>Remove</button></div>;})}
   </section>
   <div className={card}>
    <div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm font-semibold">{flow?'Revised total':'Quotation total'}</p>{flow&&<p className="mt-1 text-xs text-slate-500">Currently saved: {money(flow.quotation.total)}</p>}</div><p className="text-xl font-semibold" aria-label="Draft total">{draftTotal===undefined?'Complete selections':money(draftTotal)}</p></div>
    {pricingError&&<p role="status" className="mt-3 text-sm text-amber-800">{pricingError}</p>}
    {flow?.stage==='contract'&&<label className="mt-5 flex items-start gap-3 rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900"><input type="checkbox" checked={replaceContract} onChange={e=>setReplaceContract(e.target.checked)} className="mt-1"/>Replace the unsigned contract. The previous document will be kept in history, and the revised quotation must be approved before a new contract can be generated.</label>}
    <div className="mt-5 flex flex-wrap gap-3"><button disabled={draftTotal===undefined||addingOpening||(flow?.stage==='contract'&&!replaceContract)} onClick={()=>void act('save')} className={button}>{busy?'Saving…':flow?'Save revised quotation':'Generate quotation'}</button>{flow&&<button className={secondary} onClick={()=>void cancel()}>Cancel changes</button>}</div>
    {addingOpening&&<p className="mt-3 text-sm text-slate-500">Add or cancel the opening form before saving.</p>}
   </div>
  </fieldset>:null}
  {flow&&<section className="mt-6">
   {!editing&&<div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
    <label className="min-w-0 text-sm">Quotation version<select aria-label="Quotation version" value={viewVersion} onChange={e=>{setViewVersion(e.target.value);setApproved(false);}} className={field}><option value="current">Revision {flow.quotation.version??1} · Current</option>{data.history?.map(h=><option key={h.version} value={h.version}>Revision {h.version} · Superseded</option>)}</select></label>
    {canEdit?<button className={button} onClick={()=>{setEditing(true);setViewVersion('current');setApproved(false);}}>Edit quotation</button>:<p className="text-sm text-slate-600">Signed contract · Quotation locked</p>}
   </div>}
   {editing&&<p className="mb-3 text-sm text-slate-500 print:hidden">Saved quotation below. Your draft changes will appear after saving.</p>}
   {shown&&<DocumentPaper>
    <DocumentHeader kind="Quotation" number={reference} createdAt={shown.createdAt}/>
    {archived&&<p className="my-5 border border-amber-400 bg-amber-50 p-3 font-semibold text-amber-900">SUPERSEDED — For reference only. This quotation cannot be approved or signed.{archived.contract?` Contract ${archived.contract.number} was also superseded.`:''}</p>}
    <DocumentParties client={data.client} project={{number:data.project.project_number,address:data.project.address}}/>
    <OpeningSchedule quote={shown}/><p className="document-note">Prepared from the recorded initial measurements and selected specifications. Contract terms are presented in the separate client contract.</p><DocumentFooter reference={reference}/>
   </DocumentPaper>}
   <div className="mt-6 flex flex-wrap gap-3 print:hidden">
    <button disabled={editing} onClick={()=>window.print()} className={secondary}>Print quotation</button>
    {!editing&&!archived&&flow.stage==='quotation'&&<div className="w-full border-t border-slate-200 pt-5"><label className="mb-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>The client approved this saved quotation.</label><button disabled={busy||!approved} onClick={()=>void act('approve')} className={button}>Record client approval</button></div>}
    {!editing&&!archived&&flow.stage==='approved'&&<div className="w-full space-y-4"><label className="block text-sm">Contract template<select aria-label="Contract template" value={template} onChange={e=>setTemplate(e.target.value as 'residential'|'commercial')} className={field}><option value="residential">Residential — uploaded Arabic terms</option><option value="commercial">Commercial — uploaded Arabic terms</option></select></label><p className="text-sm text-slate-500">Each template has its own payment schedule. Review all terms before signing.</p><button disabled={busy} onClick={()=>void act('contract')} className={button}>Generate contract</button></div>}
    {!editing&&flow.contract&&<Link href={`/contract/${projectId}`} className={button}>Open contract →</Link>}
   </div>
  </section>}
 </>;
}
export function QuotationWorkspace({projectId}:{projectId:string}) {
 const resource=useResource<QuoteData>(`/api/sales-flow/${projectId}`);
 const [reset,setReset]=useState(0);
 async function reload(){await resource.reload();setReset(n=>n+1);}
 return <Workspace title="Quotation" description="Prepare and revise the client’s quotation using measured openings and preset catalog prices."><ProjectRecord projectId={projectId}/><Notice error={resource.error}/>{resource.loading?<p>Loading quotation…</p>:resource.data?<QuoteEditor key={`${resource.data.flow?.revision??0}:${reset}`} data={resource.data} projectId={projectId} reload={reload}/>:null}</Workspace>;
}
