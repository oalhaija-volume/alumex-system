"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import Link from 'next/link';
import { useState } from 'react';
import { defaultSystem,systemOptions,additionalOptions,priceQuotation,type CatalogItem,type MeasuredOpening,type OpeningChoice,type AdditionalChoice } from '@/lib/workflow/pricing';
import { quotationOpenings } from '@/lib/workflow/quotationOpenings';
import type { RegistrationOpening } from '@/lib/measurements/registrationOpening';
import type { QuotationRevision,SalesFlow } from '@/lib/workflow/types';
import { ProjectRecord } from './ProjectRecord';
import { QuotationOpeningForm } from './QuotationOpeningForm';
import { DocumentHeader,DocumentParties,OpeningSchedule,DocumentFooter,DocumentPaper } from './CommercialDocument';
import { api,button,card,field,Notice,secondary,useResource,Workspace } from './ui';

type QuoteData={project:{project_name:string;project_number:string;address:string;sales_status:string};client:{name:string;mobile:string;client_type?:string};openings:MeasuredOpening[];catalog:CatalogItem[];flow:SalesFlow|null;history:QuotationRevision[]};
const quantityLabel=(unit?:string)=>unit==='sqm'?'Area (m²)':unit==='meter'?'Length (m)':'Quantity';

function QuoteEditor({data,projectId,reload}:{data:QuoteData;projectId:string;reload:()=>Promise<void>}) {
 const { term,formatMoney,formatNumber,errorMessage } = useI18n();
 const rateLabel=(p:CatalogItem)=>p.unit_price>0?`${formatMoney(p.unit_price)} / ${term(p.unit)}`:term('Price required');
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
    <p>{flow?term('Editing revision {current}. Saving creates revision {next} and requires new client approval.',{current:formatNumber(flow.quotation.version??1),next:formatNumber((flow.quotation.version??1)+1)}):term("Alumex is selected by default. Choose the specifications requested by the client.")}</p>
    <p>{term("All items are recalculated using current catalog rates. Review the new total before saving.")}</p>
   </div>
   {openings.map((opening,index)=>{
    const choice=choices[index];
    const isNew=newOpenings.some(o=>o.id===opening.id);
    return <section key={opening.id} className={card} aria-label={term('Opening {number}',{number:formatNumber(index+1)})}>
     <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{term('Opening {number}',{number:formatNumber(index+1)})} · {term(opening.opening_type)} {opening.opening_direction?term(opening.opening_direction):''}</h2>{isNew&&<button type="button" className="min-h-11 px-3 text-sm text-red-700" onClick={()=>{setNewOpenings(rows=>rows.filter(o=>o.id!==opening.id));setChoices(rows=>rows.filter(c=>c.openingId!==opening.id));}}>{term("Remove new opening")}</button>}</div>
     <p className="mt-2 text-sm text-slate-500">{term("Floor")} {term(opening.floor)} · {term(opening.room)} · {formatNumber(opening.width)} × {formatNumber(opening.height)} {term("cm")}{isNew?` · ${term('Not saved yet')}`:''}</p>
     <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm">{term("System / product")}<select aria-label={term("System / product")} value={choice.systemId} onChange={e=>edit(index,{systemId:e.target.value})} className={field}><option value="">{term("Choose system")}</option>{systemOptions(opening,catalog).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>
      <label className="text-sm">{term("Glass")}<select aria-label={term("Glass")} value={choice.glassId} onChange={e=>edit(index,{glassId:e.target.value,extras:choice.extras.filter(x=>x.id!==e.target.value)})} className={field}><option value="">{term("Standard glass included")}</option>{catalog.filter(p=>/glass/i.test(p.name)).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>
     </div>
     <div className="mt-5"><label className="text-sm">{term("Add an extra")}<select aria-label={term("Add an extra")} value="" onChange={e=>{if(e.target.value)edit(index,{extras:[...choice.extras,{id:e.target.value,quantity:1}]});}} className={field}><option value="">{term("Choose add-on")}</option>{catalog.filter(p=>(p.category==='addon'||p.category==='service')&&p.id!==choice.systemId&&p.id!==choice.glassId&&!choice.extras.some(e=>e.id===p.id)).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>
      {choice.extras.map(extra=>{const p=catalog.find(p=>p.id===extra.id);return <div key={extra.id} className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3">
       <span className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">{term(p?.name??'Unavailable item')}{p?.unit==='sqm'&&<span className="block text-xs text-slate-500">{term("Uses this opening’s area")}</span>}</span>
       {p?.unit!=='sqm'&&<label className="text-xs">{term(quantityLabel(p?.unit))}<input aria-label={term('{name} quantity',{name:term(p?.name)})} type="number" min="0.01" max="1000000" step="0.01" value={extra.quantity||''} className={`${field} max-w-28`} onChange={e=>edit(index,{extras:choice.extras.map(x=>x.id===extra.id?{...x,quantity:Number(e.target.value)}:x)})}/></label>}
       <button type="button" className="min-h-11 px-3 text-sm text-red-700" onClick={()=>edit(index,{extras:choice.extras.filter(x=>x.id!==extra.id)})}>{term("Remove")}</button>
      </div>;})}
     </div>
    </section>;
   })}
   {addingOpening?<QuotationOpeningForm onAdd={addOpening} onCancel={()=>setAddingOpening(false)}/>:<button type="button" disabled={newOpenings.length>=100} onClick={()=>setAddingOpening(true)} className={secondary}>{term("+ Add opening")}</button>}
   <section className={card}>
    <h2 className="font-semibold">{term("Additional products & services")}</h2><p className="mt-2 text-sm text-slate-500">{term("Items for the whole project. Enter the quantity, area or length for each item.")}</p>
    <label className="mt-4 block text-sm">{term("Add product or service")}<select aria-label={term("Add product or service")} className={field} value="" onChange={e=>{if(e.target.value)setAdditionalItems(items=>[...items,{id:e.target.value,quantity:1}]);}}><option value="">{term("Choose from the price catalog")}</option>{additionalOptions(catalog).filter(p=>!additionalItems.some(item=>item.id===p.id)).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>
    {additionalItems.map(item=>{const p=catalog.find(p=>p.id===item.id);return <div key={item.id} className="mt-4 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"><div className="w-full min-w-0 self-center sm:w-auto sm:flex-1"><p className="text-sm font-medium">{term(p?.name??'Unavailable item')}</p>{p&&<p className="mt-1 text-xs text-slate-500">{rateLabel(p)}</p>}</div><label className="text-xs">{term(quantityLabel(p?.unit))}<input aria-label={term('{name} project quantity',{name:term(p?.name)})} className={`${field} max-w-28`} type="number" min="0.01" max="1000000" step="0.01" value={item.quantity||''} onChange={e=>setAdditionalItems(items=>items.map(x=>x.id===item.id?{...x,quantity:Number(e.target.value)}:x))}/></label><button type="button" aria-label={term('Remove {name}',{name:term(p?.name)})} className="min-h-12 px-3 text-sm text-red-700" onClick={()=>setAdditionalItems(items=>items.filter(x=>x.id!==item.id))}>{term("Remove")}</button></div>;})}
   </section>
   <div className={card}>
    <div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm font-semibold">{flow?term("Revised total"):term("Quotation total")}</p>{flow&&<p className="mt-1 text-xs text-slate-500">{term("Currently saved:")} {formatMoney(flow.quotation.total)}</p>}</div><p className="text-xl font-semibold" aria-label={term("Draft total")}>{draftTotal===undefined?term("Complete selections"):formatMoney(draftTotal)}</p></div>
    {pricingError&&<p role="status" className="mt-3 text-sm text-amber-800">{errorMessage(pricingError)}</p>}
    {flow?.stage==='contract'&&<label className="mt-5 flex items-start gap-3 rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900"><input type="checkbox" checked={replaceContract} onChange={e=>setReplaceContract(e.target.checked)} className="mt-1"/>{term("Replace the unsigned contract. The previous document will be kept in history, and the revised quotation must be approved before a new contract can be generated.")}</label>}
    <div className="mt-5 flex flex-wrap gap-3"><button disabled={draftTotal===undefined||addingOpening||(flow?.stage==='contract'&&!replaceContract)} onClick={()=>void act('save')} className={button}>{busy?term("Saving…"):flow?term("Save revised quotation"):term("Generate quotation")}</button>{flow&&<button className={secondary} onClick={()=>void cancel()}>{term("Cancel changes")}</button>}</div>
    {addingOpening&&<p className="mt-3 text-sm text-slate-500">{term("Add or cancel the opening form before saving.")}</p>}
   </div>
  </fieldset>:null}
  {flow&&<section className="mt-6">
   {!editing&&<div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
    <label className="min-w-0 text-sm">{term("Quotation version")}<select aria-label={term("Quotation version")} value={viewVersion} onChange={e=>{setViewVersion(e.target.value);setApproved(false);}} className={field}><option value="current">{term('Revision {number} · Current',{number:formatNumber(flow.quotation.version??1)})}</option>{data.history?.map(h=><option key={h.version} value={h.version}>{term('Revision {number} · Superseded',{number:formatNumber(h.version)})}</option>)}</select></label>
    {canEdit?<button className={button} onClick={()=>{setEditing(true);setViewVersion('current');setApproved(false);}}>{term("Edit quotation")}</button>:<p className="text-sm text-slate-600">{term("Signed contract · Quotation locked")}</p>}
   </div>}
   {editing&&<p className="mb-3 text-sm text-slate-500 print:hidden">{term("Saved quotation below. Your draft changes will appear after saving.")}</p>}
   {shown&&<DocumentPaper>
    <DocumentHeader kind="Quotation" number={reference} createdAt={shown.createdAt}/>
    {archived&&<p className="my-5 border border-amber-400 bg-amber-50 p-3 font-semibold text-amber-900">{term("SUPERSEDED — For reference only. This quotation cannot be approved or signed.")}{archived.contract?' '+term('Contract {number} was also superseded.',{number:archived.contract.number}):''}</p>}
    <DocumentParties client={data.client} project={{number:data.project.project_number,address:data.project.address}}/>
    <OpeningSchedule quote={shown}/><p className="document-note">{term("Prepared from the recorded initial measurements and selected specifications. Contract terms are presented in the separate client contract.")}</p><DocumentFooter reference={reference}/>
   </DocumentPaper>}
   <div className="mt-6 flex flex-wrap gap-3 print:hidden">
    <button disabled={editing} onClick={()=>window.print()} className={secondary}>{term("Print quotation")}</button>
    {!editing&&!archived&&flow.stage==='quotation'&&<div className="w-full border-t border-slate-200 pt-5"><label className="mb-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>{term("The client approved this saved quotation.")}</label><button disabled={busy||!approved} onClick={()=>void act('approve')} className={button}>{term("Record client approval")}</button></div>}
    {!editing&&!archived&&flow.stage==='approved'&&<div className="w-full space-y-4"><label className="block text-sm">{term("Contract template")}<select aria-label={term("Contract template")} value={template} onChange={e=>setTemplate(e.target.value as 'residential'|'commercial')} className={field}><option value="residential">{term("Residential — uploaded Arabic terms")}</option><option value="commercial">{term("Commercial — uploaded Arabic terms")}</option></select></label><p className="text-sm text-slate-500">{term("Each template has its own payment schedule. Review all terms before signing.")}</p><button disabled={busy} onClick={()=>void act('contract')} className={button}>{term("Generate contract")}</button></div>}
    {!editing&&flow.contract&&<Link href={`/contract/${projectId}`} className={button}>{term("Open contract →")}</Link>}
   </div>
  </section>}
 </>;
}
export function QuotationWorkspace({projectId}:{projectId:string}) {
 const { term } = useI18n();
 const resource=useResource<QuoteData>(`/api/sales-flow/${projectId}`);
 const [reset,setReset]=useState(0);
 async function reload(){await resource.reload();setReset(n=>n+1);}
 return <Workspace title={term("Quotation")} description={term("Prepare and revise the client’s quotation using measured openings and preset catalog prices.")}><ProjectRecord projectId={projectId}/><Notice error={resource.error}/>{resource.loading?<p>{term("Loading quotation…")}</p>:resource.data?<QuoteEditor key={`${resource.data.flow?.revision??0}:${reset}`} data={resource.data} projectId={projectId} reload={reload}/>:null}</Workspace>;
}
