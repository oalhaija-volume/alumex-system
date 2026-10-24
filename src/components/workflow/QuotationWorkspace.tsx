"use client";
import type { ProjectBranch, ProjectGovernorate } from '@/lib/intake/projectBranch';
import { useI18n } from '@/components/i18n/I18nProvider';
import Link from 'next/link';
import { useState } from 'react';
import { applyQuotationDiscount,recordedFacadeAreas,defaultSystem,systemOptions,glassOptions,addonOptions,quotableOpenings,priceQuotation,isQuotationSystemRateEditable,isRollerShutterMotor,QUOTATION_SYSTEM_RATE_MIN,type CatalogItem,type MeasuredOpening,type OpeningChoice,type AdditionalChoice,type QuoteSnapshot } from '@/lib/workflow/pricing';
import { StandaloneItems } from './StandaloneItems';
import { isShutterBox, isRollerShutter, normalizeCatalogItem } from '@/lib/workflow/catalogRules';
import { quotationOpenings } from '@/lib/workflow/quotationOpenings';
import type { RegistrationOpening } from '@/lib/measurements/registrationOpening';
import type { QuotationRevision,SalesFlow } from '@/lib/workflow/types';
import {MeasurementReports} from "@/components/measurements/MeasurementReports";
import { ProjectRecord } from './ProjectRecord';
import { QuotationOpeningForm } from './QuotationOpeningForm';
import { discountedSystemRate,measuredOpeningArea,billableOpeningArea,openingSellingBand,openingMinimumSellingRate,quotationSellingSuggestion } from '@/lib/workflow/pricing';
import { OpeningAreaBadge,OpeningSellingLegend } from './OpeningAreaIndicator';
import { DocumentHeader,DocumentParties,OpeningSchedule,DocumentFooter,DocumentPaper } from './CommercialDocument';
import { api,button,card,field,Notice,secondary,useResource,Workspace } from './ui';

type QuoteData={project:{additional_openings_state?:'requested'|'submitted'|null;branch?:ProjectBranch|null;governorate?:ProjectGovernorate|null;project_name:string;project_number:string;address:string;sales_status:string};client:{name:string;mobile:string;client_type?:string};openings:MeasuredOpening[];catalog:CatalogItem[];flow:SalesFlow|null;history:QuotationRevision[]};
const quantityLabel=(unit?:string)=>unit==='sqm'?'Area (m²)':unit==='meter'?'Length (m)':'Quantity';
type PricePreview={quotation:QuoteSnapshot;priceKey:string;revision:number};
const pricePreviewConflicts=new Set(['Catalog prices changed. Preview the updated prices again before saving.','The project changed. Reload and try again.']);

function QuoteEditor({data,projectId,reload,clearActionError}:{data:QuoteData;projectId:string;reload:(error?:string)=>Promise<void>;clearActionError:()=>void}) {
 const { term,formatMoney,formatNumber,errorMessage } = useI18n();
 const rateLabel=(p:CatalogItem)=>p.unit_price>0?isRollerShutter(p)?term('{price} per opening',{price:formatMoney(p.unit_price)}):`${formatMoney(p.unit_price)} / ${term(p.unit)}`:term('Price required');
 const {flow}=data;
 const catalog=data.catalog.map(normalizeCatalogItem);
 const [newOpenings,setNewOpenings]=useState<RegistrationOpening[]>([]);
 const openings=quotableOpenings(quotationOpenings(data.openings,newOpenings));
 const [choices,setChoices]=useState<OpeningChoice[]>(()=>quotableOpenings(data.openings).map(o=>{
  const saved=flow?.quotation.lines.find(l=>l.opening.id===o.id);
  return {openingId:o.id,systemId:saved?.system.id??defaultSystem(o,catalog)?.id??'',...(saved?.system.rateSource==='quotation'?{systemRate:saved.system.rate}:{}),glassId:saved?.glass?.id??'',extras:saved?.extras.filter(e=>!isRollerShutterMotor(e)).map(e=>{
   const motor=saved.extras.find(charge=>isRollerShutterMotor(charge)&&charge.motorFor===e.id);
   return {id:e.id,quantity:isRollerShutter(e)?1:e.unit==='sqm'?e.quantity:e.quantity/(saved.opening.quantity??1),...(motor?{motorPrice:motor.rate}:{})};
  })??[]};
 }));
 const [additionalItems,setAdditionalItems]=useState<AdditionalChoice[]>(()=>flow?.quotation.additionalItems?.map(item=>({id:item.id,quantity:item.quantity,measurements:item.measurements,extras:item.extras?.map(e=>({id:e.id,quantity:e.quantity}))}))??[]);
 const [discountPercent,setDiscountPercent]=useState<0|5>(flow?.quotation.discount?.percent??0);
 const [editing,setEditing]=useState(!flow);
 const [addingOpening,setAddingOpening]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [approved,setApproved]=useState(false);
 const [replaceContract,setReplaceContract]=useState(false);
 const [pricePreview,setPricePreview]=useState<PricePreview|null>(null);
 const [previewLoading,setPreviewLoading]=useState(false);
 const [viewVersion,setViewVersion]=useState('current');
 const suggestionPreferenceKey=`alumex-quotation-hide-suggestion:${projectId}`;
 const [suggestionHidden,setSuggestionHidden]=useState(()=>{
  try{return typeof window!=='undefined'&&window.localStorage.getItem(suggestionPreferenceKey)==='1';}catch{return false;}
 });
 const [template,setTemplate]=useState<'residential'|'commercial'>(['company','corporate'].includes(data.client.client_type??'')?'commercial':'residential');
 const waiting=data.project.additional_openings_state==='requested';
 const needsRevision=!!data.project.additional_openings_state;
 const canEdit=!waiting&&!['contract_signed','transferred_to_operations','cancelled','lost','closed'].includes(data.project.sales_status)&&(!flow||(!flow.signed_at&&['quotation','approved','contract'].includes(flow.stage)));
 const canUpdatePrices=!!flow&&canEdit&&!needsRevision&&viewVersion==='current'&&!['contract_signed','transferred_to_operations','cancelled','lost','closed'].includes(data.project.sales_status);
 const archived=viewVersion==='current'?undefined:data.history?.find(h=>String(h.version)===viewVersion);
 const shown=archived?.quotation??flow?.quotation;
 const reference=`QT-${data.project.project_number}-R${archived?.version??shown?.version??1}`;
 let draftTotal:number|undefined;
 let draftQuotation:QuoteSnapshot|undefined;
 let pricingError='';
 if(editing){try{draftQuotation=priceQuotation(openings,choices,catalog,'preview',additionalItems,discountPercent);draftTotal=draftQuotation.total;}catch(e){pricingError=(e as Error).message;}}
 const discountChanged=discountPercent!==(flow?.quotation.discount?.percent??0);
 let discountPreview:QuoteSnapshot|undefined;
 if(flow&&canUpdatePrices&&!editing){try{discountPreview=applyQuotationDiscount(flow.quotation,discountPercent);}catch{/* Invalid saved amounts cannot be discounted. */}}
 function discountOption(quotation?:QuoteSnapshot){
  return <>
   <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" aria-label={term('Apply 5% discount')} aria-describedby="quotation-discount-help" disabled={busy} checked={discountPercent===5} onChange={event=>{setDiscountPercent(event.target.checked?5:0);setApproved(false);}}/>{term('Apply 5% discount')}</label>
   <p id="quotation-discount-help" className="text-xs leading-5 text-slate-600">{term('5% applies to the full quotation subtotal.')}</p>
   {quotation&&<dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-slate-600">{term('Subtotal')}</dt><dd className="mt-1 font-semibold">{formatMoney(quotation.discount?.subtotal??quotation.total)}</dd></div><div><dt className="text-slate-600">{term('Discount (5%)')}</dt><dd className="mt-1 font-semibold">−{formatMoney(quotation.discount?.amount??0)}</dd></div><div><dt className="text-slate-600">{term('Final total')}</dt><dd className="mt-1 font-semibold text-blue-900">{formatMoney(quotation.total)}</dd></div></dl>}
  </>;
 }
 const sellingQuote=editing?draftQuotation:discountPreview??flow?.quotation;
 const sellingSuggestion=flow&&sellingQuote&&!archived&&!needsRevision&&canEdit&&!pricePreview?quotationSellingSuggestion(sellingQuote,catalog):null;
 const targetRates=new Map(sellingSuggestion?.openingRates.map(opening=>[opening.openingId,opening.rate]));
 const suggestedChoices=sellingSuggestion?choices.map(choice=>targetRates.has(choice.openingId)?{...choice,systemRate:targetRates.get(choice.openingId)}:choice):choices;
 let suggestedQuotation:QuoteSnapshot|undefined;
 if(sellingSuggestion?.canApply){try{suggestedQuotation=priceQuotation(openings,suggestedChoices,catalog,'preview',additionalItems,discountPercent);}catch{/* Incomplete selections remain editable. */}}
 const suggestedPricing=suggestedQuotation?quotationSellingSuggestion(suggestedQuotation,catalog):sellingSuggestion?.canApply===false?sellingSuggestion:null;
 function applySuggestedRate(){
  if(!sellingSuggestion?.canApply||busy||pricePreview)return;
  setChoices(suggestedChoices);setEditing(true);setViewVersion('current');setApproved(false);setError('');clearActionError();
 }
 function toggleSuggestion(){
  const hidden=!suggestionHidden;
  setSuggestionHidden(hidden);
  try{window.localStorage.setItem(suggestionPreferenceKey,hidden?'1':'0');}catch{/* The toggle still works when browser storage is unavailable. */}
 }
 function edit(index:number,patch:Partial<OpeningChoice>){setChoices(c=>c.map((v,i)=>i===index?{...v,...patch}:v));}
 function addOpening(opening:RegistrationOpening){
  const measured=quotationOpenings([], [opening])[0];
  setNewOpenings(rows=>[...rows,opening]);
  setChoices(rows=>[...rows,{openingId:opening.id,systemId:defaultSystem(measured,catalog)?.id??'',glassId:'',extras:[]}]);
  setAddingOpening(false);
 }
 async function act(action:string){
  if(busy||pricePreview)return;
  setBusy(true);setError('');clearActionError();
  try{
   await api(`/api/sales-flow/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,choices,additionalItems,newOpenings,discountPercent,revision:flow?.revision??0,confirmed:approved,template,replaceUnsignedContract:replaceContract})});
   await reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function updatePrices(save=false){
  if(busy||!flow||!canUpdatePrices||(save&&!pricePreview))return;
  if(save&&flow.stage==='contract'&&!replaceContract)return;
  setBusy(true);setError('');clearActionError();setApproved(false);
  if(!save){setPreviewLoading(true);setReplaceContract(false);}
  try{
   if(save&&pricePreview){
    await api(`/api/sales-flow/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update-prices',revision:pricePreview.revision,priceKey:pricePreview.priceKey,confirmed:true,replaceUnsignedContract:replaceContract})});
    await reload();
   }else{
    const preview=await api<PricePreview>(`/api/sales-flow/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preview-prices',revision:flow.revision})});
    setPricePreview(preview);
   }
  }catch(cause){
   const message=(cause as Error).message;
   if(pricePreviewConflicts.has(message)){
    setPricePreview(null);setReplaceContract(false);
    try{await reload(message);}catch{setError(message);}
   }else setError(message);
  }finally{setBusy(false);setPreviewLoading(false);}
 }
 async function cancel(){setBusy(true);setError('');try{await reload();setEditing(false);setAddingOpening(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <>
  <Notice error={error}/>
  {needsRevision&&<p role="status" className="mb-5 rounded-md bg-amber-50 p-4 text-sm text-amber-900 print:hidden">{term(waiting?'Additional openings are being measured. Wait for submission before revising the quotation.':'Additional measurements received. Save a quotation revision before approval or contract signing.')}</p>}
  {['ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated'].includes(data.project.sales_status)&&<Link href={`/mini-crm#project-${projectId}`} className={`${secondary} mb-5 inline-flex print:hidden`}>{term('Add more openings')}</Link>}
   {data.openings.some(o=>o.opening_type==='Curtain Wall')&&<Link href={`/initial-measurements/${projectId}`} className="block min-h-11 text-sm font-semibold text-blue-700 underline print:hidden">{term('View Curtain Wall photos and notes')}</Link>}
  {editing&&canEdit?<fieldset disabled={busy} className="min-w-0 space-y-5 print:hidden">
   <div className="rounded-md bg-blue-50 p-4 text-sm leading-6 text-blue-900">
    <p>{flow?term('Editing revision {current}. Saving creates revision {next} and requires new client approval.',{current:formatNumber(flow.quotation.version??1),next:formatNumber((flow.quotation.version??1)+1)}):term("Alumex is selected by default. Choose the specifications requested by the client.")}</p>
    <p>{term("Catalog rates apply unless you set an Alumex system rate for this quotation. Review the new total before saving.")}</p>
   </div>
   {!!openings.length&&<OpeningSellingLegend discountPercent={discountPercent}/>}
   {openings.map((opening,index)=>{
    const choice=choices[index];
    const system=catalog.find(p=>p.id===choice.systemId);
    const editableRate=!!system&&isQuotationSystemRateEditable(system);
    const systemRate=choice.systemRate??Number(system?.unit_price);
    const invalidRate=editableRate&&choice.systemRate!==undefined&&(!Number.isSafeInteger(systemRate)||systemRate<QUOTATION_SYSTEM_RATE_MIN);
    const isNew=newOpenings.some(o=>o.id===opening.id);
    const area=measuredOpeningArea(opening);
    const band=editableRate?openingSellingBand(area,discountedSystemRate(systemRate,discountPercent),opening):undefined;
    const minimumApplied=billableOpeningArea(opening)>area&&[choice.systemId,choice.glassId,...choice.extras.map(extra=>extra.id)].some(id=>catalog.some(item=>item.id===id&&item.unit==='sqm'));
    return <section key={opening.id} data-area-band={band} className={`${card} quotation-opening${band?` opening-area-${band}`:''}`} aria-label={term('Opening {number}',{number:formatNumber(index+1)})}>
     <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{term('Opening {number}',{number:formatNumber(index+1)})} · {term(opening.opening_type)} {opening.opening_direction?term(opening.opening_direction):''}{opening.has_arch?` · ${term('Arch')}`:''}</h2>{editableRate?<OpeningAreaBadge area={area} rate={systemRate} opening={opening} discountPercent={discountPercent}/>:<span className="text-xs text-slate-600">{term('Each opening: {area} m²',{area:formatNumber(area)})}</span>}{isNew&&<button type="button" className="min-h-11 px-3 text-sm text-red-700" onClick={()=>{setNewOpenings(rows=>rows.filter(o=>o.id!==opening.id));setChoices(rows=>rows.filter(c=>c.openingId!==opening.id));}}>{term("Remove new opening")}</button>}</div>
     <p className="mt-2 text-sm text-slate-500">{term("Floor")} {term(opening.floor)} · {opening.work_area==='internal'?`${term('Internal works')} · ${term(opening.room)}`:term(opening.room)} · {formatNumber(opening.width)} × {formatNumber(opening.height)} {term("cm")} · {term("Quantity")}: {formatNumber(opening.quantity??1)}{isNew?` · ${term('Not saved yet')}`:''}</p>
     {minimumApplied&&<p className="mt-2 text-xs text-slate-600">{term('Minimum billable area: 1 m² per window.')} {term('Billable area: {area} m²',{area:formatNumber(billableOpeningArea(opening)*(opening.quantity??1))})}</p>}
     <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm">{term("System / product")}<select aria-label={term("System / product")} value={choice.systemId} onChange={e=>edit(index,{systemId:e.target.value,systemRate:undefined,glassId:'',extras:[]})} className={field}><option value="">{term("Choose system")}</option>{systemOptions(opening,catalog).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>
      <label className="text-sm">{term("Glass")}<select aria-label={term("Glass")} value={choice.glassId} onChange={e=>edit(index,{glassId:e.target.value,extras:choice.extras.filter(x=>x.id!==e.target.value)})} className={field}><option value="">{term("Standard glass included")}</option>{glassOptions(opening,catalog,choice.systemId).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>
      {editableRate&&<div className="sm:col-span-2">
       <label className="block text-sm">{term('Quotation system rate (IQD / m²)')}<input aria-label={term('Quotation system rate (IQD / m²)')} aria-describedby={`system-rate-help-${opening.id}`} aria-invalid={invalidRate} type="number" inputMode="numeric" min={QUOTATION_SYSTEM_RATE_MIN} step={1} value={systemRate||''} onChange={e=>edit(index,{systemRate:Number(e.target.value)})} className={`${field} block sm:max-w-xs`}/></label>
       <p id={`system-rate-help-${opening.id}`} className="mt-2 text-xs leading-5 text-slate-600">{term('Enter at least {minimum} IQD per m² in whole IQD. Applies to this quotation only.',{minimum:formatNumber(QUOTATION_SYSTEM_RATE_MIN)})}</p>
       <p className="mt-1 text-xs font-medium text-slate-700">{term('Minimum rate for green: {rate} / m²',{rate:formatMoney(openingMinimumSellingRate(area,opening))})}</p>
      </div>}
     </div>
     {(opening.quantity??1)>1&&<p className="mt-3 text-xs text-slate-600">{term('Specifications and add-on quantities apply to each identical opening. Area and totals include all openings.')}</p>}
     {opening.has_roller_shutter&&<div className="mt-5 rounded-md border border-blue-200 bg-blue-50 p-4">
      <p className="mb-3 text-sm font-semibold text-blue-900">{term('Roller shutter requested for this window')}</p>
      <label className="block text-sm">{term('Roller shutter type')}<select aria-label={term('Roller shutter type')} value={choice.extras.find(e=>catalog.some(p=>p.id===e.id&&isRollerShutter(p)))?.id??''} className={field} onChange={event=>edit(index,{extras:[...choice.extras.filter(e=>!catalog.some(p=>p.id===e.id&&(isRollerShutter(p)||(!event.target.value&&isShutterBox(p))))),...(event.target.value?[{id:event.target.value,quantity:1}]:[])]})}>
       <option value="">{term('Choose roller shutter type')}</option>{addonOptions(opening,catalog,choice.systemId).filter(isRollerShutter).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}
      </select></label>
     </div>}
     <div className="mt-5"><label className="text-sm">{term("Add an extra")}<select aria-label={term("Add an extra")} value="" onChange={e=>{if(e.target.value)edit(index,{extras:[...choice.extras,{id:e.target.value,quantity:1}]});}} className={field}><option value="">{term("Choose add-on")}</option>{addonOptions(opening,catalog,choice.systemId).filter(p=>p.id!==choice.systemId&&p.id!==choice.glassId&&!choice.extras.some(e=>e.id===p.id)&&(!isShutterBox(p)||choice.extras.some(e=>catalog.some(c=>c.id===e.id&&isRollerShutter(c))))&&(!isRollerShutter(p)||!choice.extras.some(e=>catalog.some(c=>c.id===e.id&&isRollerShutter(c))))).map(p=><option key={p.id} value={p.id}>{term(p.name)} · {rateLabel(p)}</option>)}</select></label>
      {choice.extras.map(extra=>{const p=catalog.find(p=>p.id===extra.id);const maximumMotorPrice=Math.floor(Number.MAX_SAFE_INTEGER/(opening.quantity??1));const invalidMotorPrice=p&&isRollerShutter(p)&&(!Number.isSafeInteger(extra.motorPrice)||(extra.motorPrice??0)<1||(extra.motorPrice??0)>maximumMotorPrice);return <div key={extra.id} className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3">
       <span className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">{term(p?.name??'Unavailable item')}{p&&isRollerShutter(p)?<span className="block text-xs text-slate-500">{term('Fixed shutter price per opening: {price}',{price:formatMoney(p.unit_price)})}</span>:p?.unit==='sqm'&&<span className="block text-xs text-slate-500">{term(minimumApplied?'Uses this opening’s billable area':'Uses this opening’s area')}</span>}</span>
       {p&&isShutterBox(p)&&<p className="w-full text-xs text-slate-500">{term('Optional with roller shutters when the structure has no concealed shutter recess.')}</p>}
       {p?.unit!=='sqm'&&(!p||!isRollerShutter(p))&&<label className="text-xs">{term(quantityLabel(p?.unit))}<input aria-label={term('{name} quantity',{name:term(p?.name)})} type="number" min={p?.unit==='item'?1:0.01} max="1000000" step={p?.unit==='item'?1:0.01} value={extra.quantity||''} className={`${field} max-w-28`} onChange={e=>edit(index,{extras:choice.extras.map(x=>x.id===extra.id?{...x,quantity:Number(e.target.value)}:x)})}/></label>}
       <button type="button" className="min-h-11 px-3 text-sm text-red-700" onClick={()=>edit(index,{extras:choice.extras.filter(x=>x.id!==extra.id&&!(p&&isRollerShutter(p)&&catalog.some(c=>c.id===x.id&&isShutterBox(c))))})}>{term("Remove")}</button>
       {p&&isRollerShutter(p)&&<div className="w-full border-t border-slate-200 pt-3">
        <label className="block text-sm font-medium">{term('Motor price (IQD per motor)')}<input aria-label={term('Motor price (IQD per motor)')} aria-describedby={`motor-price-help-${opening.id}-${extra.id}`} aria-invalid={invalidMotorPrice} required type="number" inputMode="numeric" min={1} max={maximumMotorPrice} step={1} value={extra.motorPrice??''} onChange={event=>edit(index,{extras:choice.extras.map(item=>item.id===extra.id?{...item,motorPrice:event.target.value===''?undefined:Number(event.target.value)}:item)})} className={`${field} block sm:max-w-xs`}/></label>
        <p id={`motor-price-help-${opening.id}-${extra.id}`} className="mt-2 text-xs leading-5 text-slate-600">{term('All roller shutters are motorized. Enter the motor price manually based on shutter weight. One motor is charged per opening.')}</p>
        {(opening.quantity??1)>1&&Number.isSafeInteger(extra.motorPrice)&&(extra.motorPrice??0)>0&&!invalidMotorPrice&&<p className="mt-1 text-xs font-medium text-slate-700">{term('Motor total: {count} × {price} = {total}',{count:formatNumber(opening.quantity??1),price:formatMoney(extra.motorPrice??0),total:formatMoney((extra.motorPrice??0)*(opening.quantity??1))})}</p>}
       </div>}
      </div>;})}
     </div>
    </section>;
   })}
   {data.openings.some(o=>o.opening_type==='Skylight')&&<p className="rounded-lg bg-blue-50 p-4 text-sm">{term('Skylights are priced separately in the calculator and are not included in this quotation.')} <Link href="/skylight" className="font-semibold underline">{term('Open skylight calculator')}</Link> · <Link href={`/initial-measurements/${projectId}`} className="font-semibold underline">{term('View skylight photos and drawings')}</Link></p>}
   {addingOpening?<QuotationOpeningForm onAdd={addOpening} onCancel={()=>setAddingOpening(false)}/>:<button type="button" disabled={newOpenings.length>=100} onClick={()=>setAddingOpening(true)} className={secondary}>{term("+ Add opening")}</button>}
   {data.openings.some(o=>o.opening_type==='Facade')&&<section className={card} aria-label={term('Recorded facade dimensions')}>
    <h2 className="font-semibold">{term('Recorded facade dimensions')}</h2>
    <table className="mt-3 w-full text-start text-sm"><thead><tr>{['Facade','Width (cm)','Length (cm)'].map(label=><th key={label} className="py-2 text-start">{term(label)}</th>)}</tr></thead><tbody>{data.openings.filter(o=>o.opening_type==='Facade').map(o=><tr key={o.id} className="border-t border-slate-200"><th scope="row" className="py-3 text-start">{term('Facade {number}',{number:String(o.facade_number)})}</th><td>{formatNumber(o.width)}</td><td>{formatNumber(o.height)}</td></tr>)}</tbody></table>
    <p className="mt-2 text-sm text-slate-600">{term('Choose a facade service below to price the recorded areas.')}</p>
   </section>}
   <StandaloneItems recordedAreas={recordedFacadeAreas(data.openings)} items={additionalItems} catalog={catalog} onChange={setAdditionalItems}/>
   <div className={card}>
    <div className="mb-5 border-b border-slate-200 pb-5">{discountOption(draftQuotation)}</div>
    <div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm font-semibold">{flow?term("Revised total"):term("Quotation total")}</p>{flow&&<p className="mt-1 text-xs text-slate-500">{term("Currently saved:")} {formatMoney(flow.quotation.total)}</p>}</div><p className="text-xl font-semibold" aria-label={term("Draft total")}>{draftTotal===undefined?term("Complete selections"):formatMoney(draftTotal)}</p></div>
    {pricingError&&<p role="status" className="mt-3 text-sm text-amber-800">{errorMessage(pricingError)}</p>}
    {flow?.stage==='contract'&&<label className="mt-5 flex items-start gap-3 rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900"><input type="checkbox" checked={replaceContract} onChange={e=>setReplaceContract(e.target.checked)} className="mt-1"/>{term("Replace the unsigned contract. The previous document will be kept in history, and the revised quotation must be approved before a new contract can be generated.")}</label>}
    <div className="mt-5 flex flex-wrap gap-3"><button disabled={draftTotal===undefined||addingOpening||(flow?.stage==='contract'&&!replaceContract)} onClick={()=>void act('save')} className={button}>{busy?term("Saving…"):flow?term("Save revised quotation"):term("Generate quotation")}</button>{flow&&<button className={secondary} onClick={()=>void cancel()}>{term("Cancel changes")}</button>}</div>
    {addingOpening&&<p className="mt-3 text-sm text-slate-500">{term("Add or cancel the opening form before saving.")}</p>}
   </div>
  </fieldset>:null}
  {flow&&<section className="mt-6">
   {!editing&&<div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
    <label className="min-w-0 text-sm">{term("Quotation version")}<select disabled={busy||!!pricePreview} aria-label={term("Quotation version")} value={viewVersion} onChange={e=>{setViewVersion(e.target.value);setApproved(false);setDiscountPercent(flow.quotation.discount?.percent??0);setReplaceContract(false);}} className={field}><option value="current">{term('Revision {number} · Current',{number:formatNumber(flow.quotation.version??1)})}</option>{data.history?.map(h=><option key={h.version} value={h.version}>{term('Revision {number} · Superseded',{number:formatNumber(h.version)})}</option>)}</select></label>
    {canEdit?<div className="flex flex-wrap gap-3"><button disabled={busy||!!pricePreview} className={button} onClick={()=>{clearActionError();setEditing(true);setViewVersion('current');setApproved(false);}}>{term("Edit quotation")}</button>{canUpdatePrices&&<button disabled={busy||!!pricePreview||discountChanged} className={secondary} onClick={()=>void updatePrices()}>{term(previewLoading?'Loading prices…':'Update prices')}</button>}</div>:waiting?null:<p className="text-sm text-slate-600">{term("Signed contract · Quotation locked")}</p>}
   </div>}
   {!editing&&!archived&&canUpdatePrices&&!pricePreview&&<section aria-label={term('Quotation discount')} className={`${card} mb-5 print:hidden`}>
    <h2 className="mb-2 font-semibold">{term('Quotation discount')}</h2>
    {discountOption(discountPreview)}
    <p className="mt-4 text-xs leading-5 text-slate-600">{term('Saving this discount creates a new quotation revision and resets approval.')}</p>
    {discountChanged&&<p role="status" className="mt-2 text-sm text-amber-800">{term('Discount preview: opening colors reflect the selected discount. Amounts below remain the saved quotation until you save.')}</p>}
    {flow.stage==='contract'&&<label className="mt-4 flex items-start gap-3 rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900"><input type="checkbox" disabled={busy} checked={replaceContract} onChange={event=>setReplaceContract(event.target.checked)} className="mt-1"/>{term('Replace the unsigned contract. The previous document will be kept in history, and the revised quotation must be approved before a new contract can be generated.')}</label>}
    <button type="button" disabled={busy||!discountPreview||!discountChanged||(flow.stage==='contract'&&!replaceContract)} className={`${button} mt-4`} onClick={()=>void act('set-discount')}>{term(busy?'Saving discount…':'Save discount')}</button>
   </section>}
   {sellingSuggestion&&suggestedPricing&&<div className={suggestionHidden?'mb-5 print:hidden':'mb-5 rounded-lg border border-green-200 bg-green-50 p-4 sm:p-5 print:hidden'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
     {!suggestionHidden&&<h2 className="font-semibold text-slate-900">{term('Suggested average system rate')}</h2>}
     <button type="button" aria-expanded={!suggestionHidden} aria-controls={`quotation-suggestion-${projectId}`} onClick={toggleSuggestion} className={suggestionHidden?secondary:'min-h-11 shrink-0 rounded-md px-3 text-sm font-semibold text-green-900 underline underline-offset-4 hover:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700'}>{term(suggestionHidden?'Show suggestion':'Hide suggestion')}</button>
    </div>
    <section id={`quotation-suggestion-${projectId}`} aria-label={term('Suggested average system rate')} hidden={suggestionHidden}>
    <p className="mt-2 text-2xl font-semibold text-green-900">{formatMoney(suggestedPricing.rate)} / {term('m²')}</p>
    {discountPercent===5&&<p className="mt-1 text-xs text-green-900">{term('Suggested prices before discount')}</p>}
    <p className="mt-1 text-xs text-green-900">{term('Approximate average; each opening keeps its own rate.')}</p>
    <p className="mt-2 text-sm leading-6 text-slate-700">{term('Each opening uses its own target rate. The overall rate is the area-weighted average, including quantities. Glass and add-ons are priced separately.')}</p>
    <p className="mt-1 text-xs leading-5 text-slate-600">{term('Based on {area} m² billable area across {count} Alumex openings.',{area:formatNumber(suggestedPricing.billableArea,4),count:formatNumber(suggestedPricing.openingCount)})}</p>
    <p className="mt-1 text-xs leading-5 text-slate-600">{term('Average system rate = system total ÷ billable area.')}</p>
    {sellingSuggestion.allGreen?<p role="status" className="mt-3 text-sm font-semibold text-green-900">{term('All Alumex openings meet their selling targets.')}</p>:<>
     {suggestedQuotation&&<p className="mt-3 text-sm text-slate-700">{term('Suggested quotation total')}: <strong>{formatMoney(suggestedQuotation.total)}</strong></p>}
     {sellingSuggestion.canApply?<p className="mt-2 text-xs leading-5 text-slate-600">{term('Review the suggested opening prices and save a revision to apply them.')}</p>:<p role="status" className="mt-3 text-sm text-amber-900">{term('Review the opening measurements and prices before applying this suggestion.')}</p>}
     <button type="button" disabled={busy||addingOpening||!sellingSuggestion.canApply} className={`${button} mt-4`} onClick={applySuggestedRate}>{term('Apply suggested opening prices')}</button>
    </>}
    </section>
   </div>}
   {pricePreview&&!editing&&<section aria-label={term('Update quotation prices')} className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:p-5 print:hidden">
    <h2 className="text-base font-semibold text-slate-900">{term('Update quotation prices')}</h2>
    <p className="mt-2 text-sm leading-6 text-slate-700">{term('Update prices for this quotation only. Quantities and specifications stay unchanged.')}</p>
    <dl className="mt-4 grid grid-cols-2 gap-4 rounded-md border border-blue-100 bg-white p-4"><div><dt className="text-xs text-slate-600">{term('Current total')}</dt><dd className="mt-1 break-words text-base font-semibold text-slate-900">{formatMoney(flow.quotation.total)}</dd></div><div><dt className="text-xs text-slate-600">{term('Updated total')}</dt><dd className="mt-1 break-words text-base font-semibold text-blue-800">{formatMoney(pricePreview.quotation.total)}</dd></div></dl>
    <p className="mt-3 text-xs leading-5 text-slate-600">{term('Saving creates a new revision and requires new client approval. Previous documents remain in history.')}</p>
    {flow.stage==='contract'&&<label className="mt-4 flex items-start gap-3 rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900"><input type="checkbox" disabled={busy} checked={replaceContract} onChange={event=>setReplaceContract(event.target.checked)} className="mt-1"/>{term('Replace the unsigned contract. The previous document will be kept in history, and the revised quotation must be approved before a new contract can be generated.')}</label>}
    <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy||(flow.stage==='contract'&&!replaceContract)} className={button} onClick={()=>void updatePrices(true)}>{term(busy?'Saving…':'Save updated prices')}</button><button disabled={busy} className={secondary} onClick={()=>{setPricePreview(null);setReplaceContract(false);setError('');clearActionError();}}>{term('Cancel')}</button></div>
   </section>}
   {editing&&<p className="mb-3 text-sm text-slate-500 print:hidden">{term("Saved quotation below. Your draft changes will appear after saving.")}</p>}
   {shown&&<DocumentPaper>
    <DocumentHeader kind="Quotation" number={reference} createdAt={shown.createdAt}/>
    {archived&&<p className="my-5 border border-amber-400 bg-amber-50 p-3 font-semibold text-amber-900">{term("SUPERSEDED — For reference only. This quotation cannot be approved or signed.")}{archived.contract?' '+term('Contract {number} was also superseded.',{number:archived.contract.number}):''}</p>}
    <DocumentParties client={data.client} project={{number:data.project.project_number,address:data.project.address,governorate:shown.governorate === undefined ? data.project.governorate : shown.governorate,branch:shown.branch === undefined ? data.project.branch : shown.branch}}/>
    <OpeningSchedule quote={shown} showAreaColors showOpeningAreaTotal blendSystemRates={!archived&&!flow.signed_at} colorDiscountPercent={!archived&&!editing&&canUpdatePrices&&!pricePreview?discountPercent:undefined}/><p className="document-note">{term("Prepared from the recorded initial measurements and selected specifications. Contract terms are presented in the separate client contract.")}</p><DocumentFooter reference={reference}/>
   </DocumentPaper>}
   <div className="mt-6 flex flex-wrap gap-3 print:hidden">
    <button disabled={editing||discountChanged} onClick={()=>window.print()} className={secondary}>{term("Print quotation")}</button>
    {!editing&&!archived&&!needsRevision&&flow.stage==='quotation'&&<div className="w-full border-t border-slate-200 pt-5"><label className="mb-4 flex items-center gap-3 text-sm"><input type="checkbox" disabled={busy||!!pricePreview||discountChanged} checked={approved} onChange={e=>setApproved(e.target.checked)}/>{term("The client approved this saved quotation.")}</label><button disabled={busy||!!pricePreview||discountChanged||!approved} onClick={()=>void act('approve')} className={button}>{term("Record client approval")}</button></div>}
    {!editing&&!archived&&!needsRevision&&flow.stage==='approved'&&<div className="w-full space-y-4"><label className="block text-sm">{term("Contract template")}<select disabled={busy||!!pricePreview} aria-label={term("Contract template")} value={template} onChange={e=>setTemplate(e.target.value as 'residential'|'commercial')} className={field}><option value="residential">{term("Residential — uploaded Arabic terms")}</option><option value="commercial">{term("Commercial — uploaded Arabic terms")}</option></select></label><p className="text-sm text-slate-500">{term("Each template has its own payment schedule. Review all terms before signing.")}</p><button disabled={busy||!!pricePreview||discountChanged} onClick={()=>void act('contract')} className={button}>{term("Generate contract")}</button></div>}
    {!editing&&!busy&&!pricePreview&&!discountChanged&&flow.contract&&<Link href={`/contract/${projectId}`} className={button}>{term("Open contract →")}</Link>}
   </div>
  </section>}
 </>;
}
export function QuotationWorkspace({projectId}:{projectId:string}) {
 const { term } = useI18n();
 const resource=useResource<QuoteData>(`/api/sales-flow/${projectId}`);
 const [reset,setReset]=useState(0);
 const [actionError,setActionError]=useState('');
 async function reload(error=''){await resource.reload();setActionError(error);setReset(n=>n+1);}
 return <Workspace title={term("Quotation")} description={term("Prepare and revise the client’s quotation using measured openings and preset catalog prices.")}><ProjectRecord projectId={projectId}/><MeasurementReports projectId={projectId}/><Notice error={resource.error||actionError}/>{resource.loading?<p>{term("Loading quotation…")}</p>:resource.data?<QuoteEditor key={`${projectId}:${resource.data.flow?.revision??0}:${reset}`} data={resource.data} projectId={projectId} reload={reload} clearActionError={()=>setActionError('')}/>:null}</Workspace>;
}
